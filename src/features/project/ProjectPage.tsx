import { BackupDialog } from '@/features/backup/BackupDialog';
import { FOLDER_KEY } from '@/features/backup/folderKeys';
import { Download, Search, Share2 } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useMotionAllowed } from '@/app/PreferencesProvider';
import { useMediaQuery } from '@/app/useMediaQuery';
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
import { GoalChip } from '@/features/progress/GoalChip';
import { formatWords } from '@/features/library/format';
import { resetNames, setNamePeople } from '@/features/people/nameStore';
import { useCodex, useReadingOrder } from '@/features/codex/codex';
import {
  resetCodex,
  setCodexEntries,
  setContinuityKept,
  setReadingOrder,
  setStyleSheetRules,
} from '@/features/codex/codexStore';
import { useSources } from '@/features/cite/sources';
import { resetSources, setSources } from '@/features/cite/sourceStore';
import { useSeriesOf } from '@/features/series/series';
import { resetTracking, setProjectTracking } from '@/features/editor/trackingStore';
import { usePeople } from '@/features/people/people';
import { useResearch } from '@/features/research/research';
import { ResearchList } from '@/features/research/ResearchList';
import { ResearchView } from '@/features/research/ResearchView';
import { updateProjectSettings } from '@/features/library/projects';
import { projectTransitionName } from '@/features/library/ProjectCard';
import { hasTemplate, projectDef, templateList } from '@/features/library/templates';
import { db, type AiMode, type Item, type Project, type StyleRule } from '@/lib/db';
import { countUnit } from '@/lib/wordcount';
import { Button } from '@/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/ui/dialog';
import { cn } from '@/ui/cn';
import { withViewTransition } from '@/ui/motion';
import { MotionViewTransition } from '@/ui/MotionViewTransition';
import type { CommandAction } from './CommandMenu';
import { ProjectLayout } from './ProjectLayout';
import { SplitPane } from './SplitPane';
import { useProject } from './useProject';
import { GRID_VIEW, ViewTabs } from './ViewTabs';
import { setAiMode } from '@/features/ai/modes';
import { useDocumentTitle } from '@/app/useDocumentTitle';
import { recordFeature } from '@/features/usage/usage';
import { ProjectMissing } from './ViewNotices';

/** Folder save also runs this often while the project is open, so a long session has a recent copy. */
const FOLDER_SAVE_EVERY_MS = 10 * 60_000;

// The command menu, cmdk and MiniSearch load the first time the writer opens the menu.
const CommandMenu = lazy(async () => ({ default: (await import('./CommandMenu')).CommandMenu }));
// The export dialog loads the first time the writer opens it. Each format's code loads in the export worker.
const ExportDialog = lazy(async () => ({
  default: (await import('@/features/export/ExportDialog')).ExportDialog,
}));
// The Word reader for an editor's changes loads the first time the writer opens its dialog (F45).
const ReviewImport = lazy(async () => ({
  default: (await import('@/features/import/ReviewImport')).ReviewImport,
}));
// The Share panel and the export tree that it builds load the first time the writer opens it.
const SharePanel = lazy(async () => ({
  default: (await import('@/features/share/SharePanel')).SharePanel,
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

/** The left pane's place in the address: a text item or a research file (F41). */
type Place = { item: string } | { research: string };

/** The item to open: the one in the address, else the first item that has an editor. */
function openItem(project: Project, items: readonly Item[], requested: string | null): Item | undefined {
  const def = projectDef(project);
  return (
    items.find((i) => i.id === requested && def.editorKind(i.kind) !== null) ??
    items.find((i) => def.editorKind(i.kind) !== null)
  );
}

const NO_RULES: readonly StyleRule[] = [];

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
  const [sprintOpen, setSprintOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const motion = useMotionAllowed();
  const navigate = useNavigate();
  const activeEditor = useActiveEditor();
  // The split view (F39) needs room for two pages.
  const wide = useMediaQuery('(min-width: 1024px)');
  const mainPane = useRef<HTMLDivElement>(null);
  const people = usePeople(projectId);
  const memoir = state.status === 'ready' && hasTemplate(state.project, 'memoir');
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
  const research = useResearch(projectId);
  // The editor's Codex names (F42) read the entries of the open project.
  const codex = useCodex(projectId);
  useEffect(() => {
    if (codex) setCodexEntries(projectId, codex);
  }, [codex, projectId]);
  // A change at a scene (F65) holds from that scene on, in reading order.
  const order = useReadingOrder(projectId);
  useEffect(() => {
    if (order) setReadingOrder(order);
  }, [order]);
  // The continuity check (F66) leaves out the marks that the writer kept.
  const kept = state.status === 'ready' ? state.project.settings.continuity : undefined;
  useEffect(() => {
    setContinuityKept(kept);
  }, [kept]);
  // The editor's citations (F64) read the sources of the open project.
  const sources = useSources(projectId);
  const citeStyle = state.status === 'ready' ? state.project.settings.citeStyle : undefined;
  useEffect(() => {
    if (sources) setSources(projectId, sources, citeStyle);
  }, [sources, projectId, citeStyle]);
  // The style check marks the forms that the series style sheet avoids (F59).
  const series = useSeriesOf(projectId);
  useEffect(() => {
    if (series !== undefined) setStyleSheetRules(series?.styleSheet ?? NO_RULES);
  }, [series]);
  // Track changes (F44) follows the open project's setting.
  const tracking = state.status === 'ready' ? state.project.settings.tracking : undefined;
  useEffect(() => {
    setProjectTracking(projectId, tracking);
  }, [projectId, tracking]);
  useEffect(
    () => () => {
      resetNames();
      resetCodex();
      resetSources();
      resetTracking();
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
    if (on) recordFeature('focus-mode');
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

  // Folder save (F29, F32): when the writer leaves the project or the tab, and every 10 minutes, Vlo
  // writes the project to the folder the writer picked, if the writing changed. The code loads only
  // when a save may run.
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
    const timer = setInterval(save, FOLDER_SAVE_EVERY_MS);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      clearInterval(timer);
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
    return <ProjectMissing />;
  }

  const { project, items } = state;
  const template = projectDef(project);
  // A research file in the address opens in place of the text (F41).
  const researchFile = research?.find((f) => f.id === params.get('research')) ?? null;
  const item = researchFile ? undefined : openItem(project, items, params.get('item'));
  const kind = item ? template.editorKind(item.kind) : null;
  const canOpen = (i: Item) => template.editorKind(i.kind) !== null;
  const mainId = researchFile?.id ?? item?.id ?? null;
  // Split view (F39): `beside` in the address opens a text item or a research file in a right pane.
  const besideParam = params.get('beside');
  const besideFile = besideParam === mainId ? null : (research?.find((f) => f.id === besideParam) ?? null);
  const besideItem =
    besideFile || besideParam === mainId ? undefined : items.find((i) => i.id === besideParam && canOpen(i));
  const besideKind = besideItem ? template.editorKind(besideItem.kind) : null;
  const besideId = besideFile?.id ?? besideItem?.id ?? null;
  const split = wide && !focusMode && mainId !== null && besideId !== null;
  // The Assistant, the details and the dialogs act on the item whose text has focus.
  const besideFocused = split && besideItem !== undefined && activeEditor?.itemId === besideItem.id;
  const current = besideFocused ? besideItem : item;
  const currentKind = besideFocused ? besideKind : kind;
  const totalWords = items.reduce((sum, i) => sum + i.wordCount, 0);
  const fromCard = params.get(FROM_CARD);
  // Where the left pane is in the address. A research file just added is not in `research` yet, so each
  // opener names its own key.
  const mainPlace: Place | null = researchFile
    ? { research: researchFile.id }
    : item
      ? { item: item.id }
      : null;
  /** Opens an item or a research file on the left, with the item or file to show beside it. */
  const place = (main: Place, besideOf: string | null) => {
    const id = 'item' in main ? main.item : main.research;
    setParams(besideOf !== null && besideOf !== id ? { ...main, beside: besideOf } : main);
    setDrawer(false);
  };
  const open = (id: string) => {
    place({ item: id }, besideId);
  };
  const openResearch = (id: string) => {
    place({ research: id }, besideId);
  };
  const openBeside =
    wide && mainPlace
      ? (id: string) => {
          place(mainPlace, id);
        }
      : undefined;
  const closeBeside = () => {
    if (mainPlace) place(mainPlace, null);
    // The pane and its buttons go, so the text on the left takes focus.
    mainPane.current?.querySelector<HTMLElement>('.vlo-manuscript')?.focus();
  };
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
      keywords: ['download', 'word', 'docx', 'markdown', 'google docs', 'save as', 'pdf', 'epub'],
      run: () => {
        // The export dialog opens after the menu closes, so the two dialogs never hold focus at once.
        afterMenu.current = () => {
          setExportOpen(true);
        };
      },
    },
    {
      id: 'import-review',
      label: 'Import an editor’s changes…',
      keywords: ['word', 'docx', 'editor', 'tracked changes', 'comments', 'review', 'round trip'],
      run: () => {
        afterMenu.current = () => {
          setReviewOpen(true);
        };
      },
    },
    {
      id: 'share',
      label: 'Share for reading…',
      keywords: ['share', 'link', 'beta reader', 'editor', 'comments', 'feedback', 'stop sharing'],
      run: () => {
        afterMenu.current = () => {
          setShareOpen(true);
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
    ...(hasTemplate(project, 'novel')
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
    ...(hasTemplate(project, 'memoir')
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
    ...(hasTemplate(project, 'poetry')
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
      id: 'outline',
      label: 'Open the Outline',
      keywords: ['outline', 'cards', 'index cards', 'corkboard', 'synopsis', 'labels', 'status', 'table'],
      run: () => {
        void navigate(`/p/${project.id}/outline`);
      },
    },
    {
      id: 'codex',
      label: 'Open the Codex',
      keywords: ['codex', 'characters', 'places', 'things', 'lore', 'world', 'story bible', 'wiki'],
      run: () => {
        void navigate(`/p/${project.id}/codex`);
      },
    },
    {
      id: 'feedback',
      label: 'Open Feedback',
      keywords: ['feedback', 'beta readers', 'replies', 'reactions', 'answers', 'questions', 'comments'],
      run: () => {
        void navigate(`/p/${project.id}/feedback`);
      },
    },
    {
      id: 'book',
      label: 'Open Book',
      keywords: ['book', 'print', 'trim', 'paperback', 'chapter style', 'dedication', 'contents', 'preview'],
      run: () => {
        void navigate(`/p/${project.id}/book`);
      },
    },
    {
      id: 'submissions',
      label: 'Open Submissions',
      keywords: ['submissions', 'venues', 'journals', 'sent', 'follow up', 'tracker'],
      run: () => {
        void navigate(`/p/${project.id}/submissions`);
      },
    },
    {
      id: 'sprint',
      label: 'Start a sprint…',
      keywords: ['sprint', 'timer', 'session', 'word target', 'friends', 'room', 'write in'],
      run: () => {
        afterMenu.current = () => {
          setSprintOpen(true);
        };
      },
    },
    {
      id: 'progress',
      label: 'Open Progress',
      keywords: ['progress', 'goal', 'streak', 'words', 'sessions', 'map', 'tiles', 'month challenge'],
      run: () => {
        void navigate(`/p/${project.id}/progress`);
      },
    },
    ...(series
      ? [
          {
            id: 'series',
            label: `Open ${series.title}`,
            keywords: ['series', 'books', 'style sheet', 'shared codex', 'sequel'],
            run: () => {
              void navigate(`/series/${series.id}`);
            },
          },
        ]
      : []),
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
      ? commandsFor(activeEditor.form, project.templates).map((cmd): CommandAction => ({
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
          timer={
            <>
              <GoalChip project={project} total={totalWords} />
              <SessionTimer
                projectId={project.id}
                unit={countUnit(project.settings.language)}
                sprintOpen={sprintOpen}
                onSprintOpenChange={setSprintOpen}
              />
            </>
          }
          {...(project.aiMode === 'pen'
            ? {}
            : {
                assistant: (
                  <Suspense fallback={<p className="text-sm text-muted">Loading the Assistant.</p>}>
                    <AssistantPanel
                      project={project}
                      items={items}
                      item={current}
                      kind={currentKind}
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
                variant="ghost"
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
                variant="ghost"
                className="max-sm:min-w-11 max-sm:px-0"
                onClick={() => {
                  setExportOpen(true);
                }}
              >
                <Download aria-hidden="true" className="size-4" />
                <span className="max-sm:sr-only">Export</span>
              </Button>
              <Button
                variant="ghost"
                className="max-sm:min-w-11 max-sm:px-0"
                onClick={() => {
                  setShareOpen(true);
                }}
              >
                <Share2 aria-hidden="true" className="size-4" />
                <span className="max-sm:sr-only">Share</span>
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
          binder={
            <Binder
              project={project}
              items={items}
              openItemId={item?.id ?? null}
              onOpen={open}
              {...(openBeside ? { onOpenBeside: openBeside } : {})}
              research={
                <ResearchList
                  projectId={project.id}
                  files={research ?? []}
                  openId={researchFile?.id ?? null}
                  onOpen={openResearch}
                  {...(openBeside ? { onOpenBeside: openBeside } : {})}
                />
              }
            />
          }
          details={
            <>
              <dl className="grid gap-3 text-sm">
                <div>
                  <dt className="text-muted">Project</dt>
                  <dd className="tabular-nums">
                    {formatWords(totalWords, countUnit(project.settings.language))}
                  </dd>
                </div>
                {current && (
                  <>
                    <div>
                      <dt className="text-muted">{template.kindLabel[current.kind] ?? current.kind}</dt>
                      <dd>{STATUS_LABEL[current.status]}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Synopsis</dt>
                      <dd>{current.synopsis ?? 'None yet. Add one from the binder item menu.'}</dd>
                    </div>
                  </>
                )}
              </dl>
              {current && currentKind && (
                <WritingStats
                  projectId={project.id}
                  totalWords={totalWords}
                  language={project.settings.language}
                />
              )}
            </>
          }
          manuscript={(width) => (
            // The main pane keeps its place in the tree, so opening a pane beside it never reloads its text.
            <div className={cn(split && 'grid grid-cols-2 gap-6')}>
              <div ref={mainPane} className="min-w-0">
                {researchFile ? (
                  <ResearchView
                    key={researchFile.id}
                    file={researchFile}
                    onDeleted={() => {
                      // The first item opens on the left, and the pane beside stays.
                      setParams(besideId === null ? {} : { beside: besideId });
                    }}
                  />
                ) : item && kind ? (
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
                        language={project.settings.language}
                        scriptStyle={project.settings.scriptStyle}
                        onSettings={changeSettings}
                        templates={templateList(project.templates)}
                      />
                    </MotionViewTransition>
                  </>
                ) : (
                  <p className="text-muted">Add an item from the binder to start writing.</p>
                )}
              </div>
              {split && (
                <SplitPane
                  onSwap={() => {
                    place(besideFile ? { research: besideFile.id } : { item: besideId }, mainId);
                  }}
                  onClose={closeBeside}
                >
                  {besideFile ? (
                    <ResearchView key={besideFile.id} file={besideFile} onDeleted={closeBeside} />
                  ) : (
                    besideItem &&
                    besideKind && (
                      <EditorPane
                        key={besideItem.id}
                        beside
                        item={besideItem}
                        kind={besideKind}
                        width={width}
                        snapshotEveryMinutes={project.settings.snapshotEveryMinutes}
                        font={project.settings.font}
                        page={project.settings.page}
                        language={project.settings.language}
                        scriptStyle={project.settings.scriptStyle}
                        onSettings={changeSettings}
                        templates={templateList(project.templates)}
                      />
                    )
                  )}
                </SplitPane>
              )}
            </div>
          )}
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
              <Suspense fallback={<p className="p-3 text-sm text-muted">Loading the command menu.</p>}>
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
              currentItemId={current?.id ?? null}
              people={people ?? []}
            />
          </Suspense>
        )}
        {reviewOpen && (
          <Suspense fallback={null}>
            <ReviewImport open onOpenChange={setReviewOpen} project={project} items={items} />
          </Suspense>
        )}
        {shareOpen && (
          <Suspense fallback={null}>
            <SharePanel
              open
              onOpenChange={setShareOpen}
              project={project}
              items={items}
              currentItemId={current?.id ?? null}
            />
          </Suspense>
        )}
      </section>
    </MotionViewTransition>
  );
}
