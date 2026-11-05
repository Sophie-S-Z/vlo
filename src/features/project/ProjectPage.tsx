import { BackupDialog } from '@/features/backup/BackupDialog';
import { FOLDER_KEY } from '@/features/backup/folderKeys';
import { Download, Search } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useMotionAllowed } from '@/app/PreferencesProvider';
import { Binder } from '@/features/binder/Binder';
import { cardTransitionName, FROM_CARD } from '@/features/board/useBoard';
import { STATUS_LABEL } from '@/features/binder/BinderItem';
import { runCommand, useActiveEditor } from '@/features/editor/commands/editorBus';
import { shortcutLabel } from '@/features/editor/commands/keys';
import { commandsFor } from '@/features/editor/commands/registry';
import { EditorPane } from '@/features/editor/EditorPane';
import { wordsToday } from '@/features/editor/stats/stats';
import { WritingStats } from '@/features/editor/stats/WritingStats';
import { pause as stopSound } from '@/features/sound/controller';
import { FocusControls } from '@/features/focus/FocusControls';
import { getFocusPrefs, setFocusPrefs } from '@/features/focus/focusPrefs';
import { SessionTimer } from '@/features/focus/SessionTimer';
import { formatWords } from '@/features/library/format';
import { resetNames, setNamePeople } from '@/features/people/nameStore';
import { usePeople } from '@/features/people/people';
import { updateProjectSettings } from '@/features/library/projects';
import { projectTransitionName } from '@/features/library/ProjectCard';
import { TEMPLATES } from '@/features/library/templates';
import { db, type AiMode, type Item, type Project } from '@/lib/db';
import { Button } from '@/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/ui/dialog';
import { withViewTransition } from '@/ui/motion';
import { MotionViewTransition } from '@/ui/MotionViewTransition';
import type { CommandAction } from './CommandMenu';
import { ProjectLayout } from './ProjectLayout';
import { useProject } from './useProject';
import { GRID_VIEW, ViewTabs } from './ViewTabs';
import { setAiMode } from '@/features/ai/modes';
import { useDocumentTitle } from '@/app/useDocumentTitle';

// The command menu, cmdk and MiniSearch load the first time the writer opens the menu.
const CommandMenu = lazy(async () => ({ default: (await import('./CommandMenu')).CommandMenu }));
// The export dialog loads the first time the writer opens it. Each format's code loads in the export worker.
const ExportDialog = lazy(async () => ({
  default: (await import('@/features/export/ExportDialog')).ExportDialog,
}));

// The Assistant and every AI module load only outside Pen mode (spec section 10, US09).
type AssistantModule = typeof import('@/features/ai/AssistantPanel');
let assistantModule: AssistantModule | null = null;
const AssistantPanel = lazy(async () => {
  assistantModule = await import('@/features/ai/AssistantPanel');
  return assistantModule;
});

/** True while a dialog, a menu or the / tool list is open, so Escape belongs to it. */
function layerOpen(): boolean {
  return (
    document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [data-vlo-layer]') !== null
  );
}

/** The item to open: the one in the address, else the first item that has an editor. */
function openItem(project: Project, items: readonly Item[], requested: string | null): Item | undefined {
  const def = TEMPLATES[project.template];
  return (
    items.find((i) => i.id === requested && def.editorKind(i.kind) !== null) ??
    items.find((i) => def.editorKind(i.kind) !== null)
  );
}

export function ProjectPage() {
  const { projectId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const state = useProject(projectId);
  useDocumentTitle(
    state.status === 'ready'
      ? state.project.title
      : state.status === 'missing'
        ? 'Project not found'
        : 'Project',
  );
  const [drawer, setDrawer] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const motion = useMotionAllowed();
  const navigate = useNavigate();
  const activeEditor = useActiveEditor();
  const people = usePeople(projectId);
  const memoir = state.status === 'ready' && state.project.template === 'memoir';
  const aiMode = state.status === 'ready' ? state.project.aiMode : null;

  // On a large screen the Assistant opens beside the text when the writer turns AI on. On a phone it is a
  // sheet over the text, so it waits for the Assistant button.
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [seenMode, setSeenMode] = useState<AiMode | null>(null);
  if (aiMode !== seenMode) {
    setSeenMode(aiMode);
    if (aiMode === null || aiMode === 'pen') setAssistantOpen(false);
    else if ((seenMode === null || seenMode === 'pen') && !window.matchMedia('(max-width: 599px)').matches)
      setAssistantOpen(true);
  }
  // Back in Pen mode, every answer stops and the in-browser model frees its memory.
  useEffect(() => {
    if (aiMode === 'pen' && assistantModule) void assistantModule.shutDownAssistant(projectId);
  }, [aiMode, projectId]);
  const inserted = useRef(false);

  // The editor's private-name tools read the people of the open memoir.
  useEffect(() => {
    if (memoir && people) setNamePeople(projectId, people);
  }, [memoir, people, projectId]);
  useEffect(
    () => () => {
      resetNames();
    },
    [projectId],
  );
  // A format action runs after the command menu closes, so focus goes back to the text first.
  const afterMenu = useRef<(() => void) | null>(null);

  const [settingsError, setSettingsError] = useState('');
  // The font and the page format belong to the project, so every item and every tab follows them.
  const changeSettings = useCallback(
    (change: Partial<Project['settings']>) => {
      setSettingsError('');
      updateProjectSettings(projectId, change).catch(() => {
        setSettingsError(
          'Vlo could not save that setting. Check the storage space on this device and try again.',
        );
      });
    },
    [projectId],
  );

  const changeFocusMode = (on: boolean) => {
    withViewTransition(motion, () => {
      setFocusMode(on);
    });
  };

  // The day's word count starts from the project total at the first look each day, so it starts when
  // the project opens and not when the writer first shows the details.
  const readyTotal = state.status === 'ready' ? state.items.reduce((sum, i) => sum + i.wordCount, 0) : null;
  useEffect(() => {
    if (readyTotal !== null) void wordsToday(projectId, readyTotal);
  }, [projectId, readyTotal]);

  // Sound belongs to the writing space: leaving the project stops it.
  useEffect(
    () => () => {
      stopSound();
    },
    [],
  );

  // Folder save (F29): when the writer leaves the project or the tab, Vlo writes the project to the
  // folder the writer picked, if the writing changed. The code loads only when a save may run.
  useEffect(() => {
    const save = () => {
      void db.appMeta
        .get(FOLDER_KEY)
        .then(async (row) => {
          if (!row) return;
          const { saveToFolderIfChanged } = await import('@/features/backup/folder');
          await saveToFolderIfChanged(projectId);
        })
        .catch(() => undefined);
    };
    const onHide = () => {
      if (document.visibilityState === 'hidden') save();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      save();
    };
  }, [projectId]);

  // Mod-K opens the command menu from anywhere on the project screen, the editor included.
  // Over another dialog or menu, the key does nothing, so two dialogs never stack.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'k') {
        if (layerOpen()) return;
        event.preventDefault();
        setMenuOpen(true);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
    };
  }, []);

  // In focus mode, Escape leaves it, unless a dialog or menu is open and takes the key first.
  useEffect(() => {
    if (!focusMode) return;
    const root = document.documentElement;
    root.dataset.focusMode = 'true';
    document.querySelector<HTMLElement>('.vlo-manuscript')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || layerOpen()) return;
      withViewTransition(motion, () => {
        setFocusMode(false);
      });
    };
    // Capture, so the editor's own Escape handling (Escape, then Tab, leaves the text) cannot hide it.
    window.addEventListener('keydown', onKey, true);
    return () => {
      delete root.dataset.focusMode;
      window.removeEventListener('keydown', onKey, true);
    };
  }, [focusMode, motion]);

  if (state.status === 'loading') return null;

  if (state.status === 'missing') {
    return (
      <section>
        <h1 className="font-display text-4xl font-semibold">Project not found</h1>
        <p className="mt-4 text-muted">
          This device has no project at this address. It may have been deleted.
        </p>
        <p className="mt-6">
          <Link to="/">Go to the Library</Link>
        </p>
      </section>
    );
  }

  const { project, items } = state;
  const template = TEMPLATES[project.template];
  const item = openItem(project, items, params.get('item'));
  const kind = item ? template.editorKind(item.kind) : null;
  const totalWords = items.reduce((sum, i) => sum + i.wordCount, 0);
  const fromCard = params.get(FROM_CARD);
  const open = (itemId: string) => {
    setParams({ item: itemId });
    setDrawer(false);
  };
  const canOpen = (i: Item) => template.editorKind(i.kind) !== null;
  const actions: CommandAction[] = [
    {
      id: 'focus',
      label: 'Enter focus mode',
      run: () => {
        changeFocusMode(true);
      },
    },
    {
      id: 'typewriter',
      label: getFocusPrefs().typewriter ? 'Turn off typewriter scrolling' : 'Turn on typewriter scrolling',
      run: () => {
        setFocusPrefs({ typewriter: !getFocusPrefs().typewriter });
      },
    },
    {
      id: 'dim',
      label: getFocusPrefs().dim ? 'Stop dimming other lines' : 'Dim other lines',
      run: () => {
        setFocusPrefs({ dim: !getFocusPrefs().dim });
      },
    },
    {
      id: 'export',
      label: 'Export…',
      keywords: ['download', 'word', 'docx', 'markdown', 'google docs', 'save as', 'share'],
      run: () => {
        // The export dialog opens after the menu closes, so the two dialogs never hold focus at once.
        afterMenu.current = () => {
          setExportOpen(true);
        };
      },
    },
    {
      id: 'backup',
      label: 'Back up project…',
      keywords: ['backup', 'save', 'zip', 'copy', 'move', 'another device'],
      run: () => {
        afterMenu.current = () => {
          setBackupOpen(true);
        };
      },
    },
    {
      id: 'ai-mode',
      label: 'Change AI mode…',
      keywords: ['ai', 'pen', 'reader', 'co-writer', 'assistant', 'mode', 'privacy'],
      run: () => {
        afterMenu.current = () => {
          setModeOpen(true);
        };
      },
    },
    ...(project.aiMode === 'pen'
      ? []
      : [
          {
            id: 'assistant',
            label: assistantOpen ? 'Hide the Assistant' : 'Open the Assistant',
            keywords: ['ai', 'assistant', 'feedback', 'ask', 'reader', 'co-writer', 'draft'],
            run: () => {
              afterMenu.current = () => {
                setAssistantOpen(!assistantOpen);
              };
            },
          },
          {
            id: 'pen-mode',
            label: 'Turn off AI (Pen mode)',
            keywords: ['ai', 'pen', 'off', 'privacy'],
            // A change back to Pen needs no confirm (plan Task D2).
            run: () => {
              setAiMode(project.id, 'pen').catch(() => {
                setSettingsError('Vlo could not save the mode on this device.');
              });
            },
          },
        ]),
    ...(project.template === 'novel'
      ? [
          {
            id: 'board',
            label: 'Open the Story Board',
            keywords: ['board', 'cards', 'plot', 'outline', 'corkboard'],
            run: () => {
              void navigate(`/p/${project.id}/board`);
            },
          },
          {
            id: 'grid',
            label: 'Open the Plot Grid',
            keywords: ['grid', 'threads', 'chapters', 'plot'],
            run: () => {
              void navigate(`/p/${project.id}/board?view=${GRID_VIEW}`);
            },
          },
        ]
      : []),
    ...(project.template === 'memoir'
      ? [
          {
            id: 'timeline',
            label: 'Open the Memory Timeline',
            keywords: ['timeline', 'dates', 'life stages', 'themes', 'chronology'],
            run: () => {
              void navigate(`/p/${project.id}/timeline`);
            },
          },
          {
            id: 'people',
            label: 'Open People',
            keywords: ['people', 'private names', 'aliases', 'real names'],
            run: () => {
              void navigate(`/p/${project.id}/people`);
            },
          },
        ]
      : []),
    ...(project.template === 'poetry'
      ? [
          {
            id: 'sequences',
            label: 'Open the Collection Sequencer',
            keywords: ['sequences', 'order', 'collection', 'chapbook', 'ring'],
            run: () => {
              void navigate(`/p/${project.id}/sequences`);
            },
          },
        ]
      : []),
    {
      id: 'submissions',
      label: 'Open Submissions',
      keywords: ['submissions', 'venues', 'journals', 'sent', 'follow up', 'tracker'],
      run: () => {
        void navigate(`/p/${project.id}/submissions`);
      },
    },
    {
      id: 'progress',
      label: 'Open Progress',
      keywords: ['progress', 'goal', 'streak', 'words', 'sessions', 'map', 'tiles'],
      run: () => {
        void navigate(`/p/${project.id}/progress`);
      },
    },
    {
      id: 'library',
      label: 'Go to the Library',
      run: () => {
        void navigate('/');
      },
    },
    {
      id: 'settings',
      label: 'Open Settings',
      run: () => {
        void navigate('/settings');
      },
    },
    ...(activeEditor
      ? commandsFor(activeEditor.form, project.template).map((cmd): CommandAction => ({
          id: cmd.id,
          label: cmd.kind === 'panel' ? `${cmd.label}…` : cmd.label,
          group: 'format',
          ...(cmd.keywords ? { keywords: cmd.keywords } : {}),
          ...(cmd.keys ? { hint: shortcutLabel(cmd.keys) } : {}),
          run: () => {
            afterMenu.current = () => runCommand(activeEditor.editor, cmd, 'caret');
          },
        }))
      : []),
  ];

  return (
    <MotionViewTransition name={projectTransitionName(project.id)} update="none">
      <section>
        <ProjectLayout
          binderOpen={drawer}
          onBinderOpen={setDrawer}
          focusMode={focusMode}
          onLeaveFocus={() => {
            changeFocusMode(false);
          }}
          timer={<SessionTimer projectId={project.id} />}
          {...(project.aiMode === 'pen'
            ? {}
            : {
                assistant: (
                  <Suspense fallback={<p className="text-sm text-muted">Loading the Assistant.</p>}>
                    <AssistantPanel
                      project={project}
                      items={items}
                      item={item}
                      kind={kind}
                      people={people}
                      onInserted={() => {
                        // On a phone the sheet covers the text, so it closes and the text takes focus.
                        if (window.matchMedia('(max-width: 599px)').matches) {
                          inserted.current = true;
                          setAssistantOpen(false);
                        }
                      }}
                    />
                  </Suspense>
                ),
                assistantOpen,
                onAssistantOpen: setAssistantOpen,
                onSheetCloseAutoFocus: (event: Event) => {
                  if (!inserted.current) return;
                  inserted.current = false;
                  event.preventDefault();
                  activeEditor?.editor.commands.focus();
                },
              })}
          tools={
            <>
              <Button
                variant="outline"
                className="max-sm:min-w-11 max-sm:px-0"
                aria-keyshortcuts="Control+K Meta+K"
                onClick={() => {
                  setMenuOpen(true);
                }}
              >
                <Search aria-hidden="true" className="size-4" />
                <span className="max-sm:sr-only">Search</span>
              </Button>
              <Button
                variant="outline"
                className="max-sm:min-w-11 max-sm:px-0"
                onClick={() => {
                  setExportOpen(true);
                }}
              >
                <Download aria-hidden="true" className="size-4" />
                <span className="max-sm:sr-only">Export</span>
              </Button>
              <FocusControls
                onFocusMode={() => {
                  changeFocusMode(true);
                }}
              />
            </>
          }
          title={
            <header className="min-w-0">
              <p className="text-sm text-muted">{template.label}</p>
              <h1 className="mt-1 font-display text-3xl font-semibold [overflow-wrap:anywhere] sm:text-4xl">
                {project.title}
              </h1>
              <ViewTabs project={project} modeOpen={modeOpen} onModeOpenChange={setModeOpen} />
            </header>
          }
          binder={<Binder project={project} items={items} openItemId={item?.id ?? null} onOpen={open} />}
          details={
            <>
              <dl className="grid gap-3 text-sm">
                <div>
                  <dt className="text-muted">Project</dt>
                  <dd className="font-mono">{formatWords(totalWords)}</dd>
                </div>
                {item && (
                  <>
                    <div>
                      <dt className="text-muted">{template.kindLabel[item.kind] ?? item.kind}</dt>
                      <dd>{STATUS_LABEL[item.status]}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Synopsis</dt>
                      <dd>{item.synopsis ?? 'None yet. Add one from the binder item menu.'}</dd>
                    </div>
                  </>
                )}
              </dl>
              {item && kind && <WritingStats projectId={project.id} totalWords={totalWords} />}
            </>
          }
          manuscript={(width) =>
            item && kind ? (
              <>
                {settingsError && (
                  <p role="alert" className="mx-auto mb-3 max-w-prose text-sm text-accent-text">
                    {settingsError}
                  </p>
                )}
                {/* A scene opened from a board card takes the card's name, so the card grows into it (F14).
                    With no card the boundary stays, with no animation, so the editor never remounts. */}
                <MotionViewTransition
                  key={item.id}
                  {...(fromCard
                    ? { name: cardTransitionName(fromCard), update: 'none' }
                    : { default: 'none' })}
                >
                  <EditorPane
                    item={item}
                    kind={kind}
                    width={width}
                    snapshotEveryMinutes={project.settings.snapshotEveryMinutes}
                    font={project.settings.font}
                    page={project.settings.page}
                    scene={project.settings.scene}
                    onSettings={changeSettings}
                    template={project.template}
                  />
                </MotionViewTransition>
              </>
            ) : (
              <p className="text-muted">Add an item from the binder to start writing.</p>
            )
          }
        />
        <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
          <DialogContent
            className="top-[12vh] max-w-xl translate-y-0 gap-2 p-3"
            onCloseAutoFocus={(event) => {
              const next = afterMenu.current;
              afterMenu.current = null;
              if (!next) return;
              event.preventDefault();
              next();
            }}
          >
            <DialogTitle className="sr-only">Command menu</DialogTitle>
            <DialogDescription className="sr-only">
              Type to find an item by title or by its text, or to run an action. Use the arrow keys, then
              Enter.
            </DialogDescription>
            {menuOpen && (
              <Suspense fallback={<p className="p-3 text-muted">Loading.</p>}>
                <CommandMenu
                  project={project}
                  items={items}
                  canOpen={canOpen}
                  actions={actions}
                  onOpenItem={open}
                  onDone={() => {
                    setMenuOpen(false);
                  }}
                />
              </Suspense>
            )}
          </DialogContent>
        </Dialog>
        <BackupDialog
          project={backupOpen ? project : null}
          onClose={() => {
            setBackupOpen(false);
          }}
        />
        {exportOpen && (
          <Suspense fallback={null}>
            <ExportDialog
              open
              onOpenChange={setExportOpen}
              project={project}
              items={items}
              currentItemId={item?.id ?? null}
              people={people ?? []}
            />
          </Suspense>
        )}
      </section>
    </MotionViewTransition>
  );
}
