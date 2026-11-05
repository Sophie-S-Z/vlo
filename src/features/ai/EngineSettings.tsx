import { useEffect, useId, useReducer, useRef, useState } from 'react';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';
import { Label } from '@/ui/label';
import { providerModels } from './engine/engine';
import { localHelp, PRESET_IDS, PRESETS, type PresetId } from './engine/presets';
import { hasWebGpu, WEBLLM_MODELS } from './engine/webllm';
import { EngineError } from './engine/types';
import { KeyDialog } from './KeyDialog';
import { sessionKey } from './keys';
import { drawerOff, saveEngineChoice, setDrawerOff, type EngineChoice } from './settings';

/*
 * The engine choice of the Assistant panel (spec section 10): in this browser (the default), the writer's
 * own key, or a server on the writer's computer. A key stays in this tab unless the writer stores it with a
 * passphrase (see keys.ts).
 */

type Source = 'webllm' | PresetId;

const KEY_PRESETS = PRESET_IDS.filter((p) => !PRESETS[p].local);
const LOCAL_PRESETS = PRESET_IDS.filter((p) => PRESETS[p].local);

const selectClass =
  'min-h-11 w-full rounded-md border border-rule bg-bg px-3 text-base text-text focus-visible:border-accent';

/** The engine in words, such as "Groq, llama-3.3-70b-versatile". */
export function engineName(choice: EngineChoice): string {
  if (choice.kind === 'webllm') {
    const model = WEBLLM_MODELS.find((m) => m.id === choice.model);
    return `In this browser, ${model?.label ?? choice.model}`;
  }
  const preset = PRESETS[choice.preset];
  return choice.model === '' ? preset.label : `${preset.label}, ${choice.model}`;
}

export function EngineSettings({
  choice,
  onSaved,
  onCancel,
}: {
  choice: EngineChoice;
  onSaved: (choice: EngineChoice) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [source, setSource] = useState<Source>(choice.kind === 'webllm' ? 'webllm' : choice.preset);
  const [webModel, setWebModel] = useState(
    choice.kind === 'webllm' ? choice.model : (WEBLLM_MODELS[0]?.id ?? ''),
  );
  const [model, setModel] = useState(choice.kind === 'provider' ? choice.model : '');
  const [models, setModels] = useState<string[]>([]);
  const [listing, setListing] = useState(false);
  const [gpu, setGpu] = useState<boolean | null>(null);
  const [keyOpen, setKeyOpen] = useState(false);
  const keyButton = useRef<HTMLButtonElement>(null);
  // A new key lives outside React, so the key line renders again after the key dialog.
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  const [error, setError] = useState('');
  /** True when the drawer shows each request before it goes. Null until the setting loads. */
  const [showDrawer, setShowDrawer] = useState<boolean | null>(null);
  const [drawerAtStart, setDrawerAtStart] = useState<boolean | null>(null);
  const preset = source === 'webllm' ? null : PRESETS[source];
  const hasKey = preset !== null && (preset.local || sessionKey(preset.id) !== undefined);

  useEffect(() => {
    let live = true;
    void hasWebGpu().then((yes) => {
      if (live) setGpu(yes);
    });
    void drawerOff()
      .catch(() => false)
      .then((off) => {
        if (!live) return;
        setShowDrawer(!off);
        setDrawerAtStart(!off);
      });
    return () => {
      live = false;
    };
  }, []);

  const pick = (next: Source) => {
    setSource(next);
    setModels([]);
    setError('');
    if (next !== 'webllm') {
      const same = choice.kind === 'provider' && choice.preset === next;
      setModel(same ? choice.model : PRESETS[next].defaultModel);
    }
  };

  const listModels = async () => {
    if (!preset) return;
    setError('');
    setListing(true);
    try {
      const found = await providerModels(preset.id, sessionKey(preset.id));
      setModels(found);
      if (found.length === 0) setError(`${preset.label} gave no models.`);
      else if (model.trim() === '') setModel(found[0] ?? '');
    } catch (problem) {
      setError(
        problem instanceof EngineError
          ? problem.message
          : `Vlo could not read the models of ${preset.label}.`,
      );
    } finally {
      setListing(false);
    }
  };

  const save = async () => {
    setError('');
    let next: EngineChoice;
    if (source === 'webllm') next = { kind: 'webllm', model: webModel };
    else {
      if (model.trim() === '') {
        setError(`Pick a model for ${PRESETS[source].label}.`);
        return;
      }
      next = { kind: 'provider', preset: source, model: model.trim() };
    }
    try {
      await saveEngineChoice(next);
      if (showDrawer !== null && showDrawer !== drawerAtStart) await setDrawerOff(!showDrawer);
    } catch {
      // The choice still works in this tab when storage refuses it.
    }
    onSaved(next);
  };

  return (
    <>
      <form
        aria-labelledby={`${id}-title`}
        className="grid gap-3 rounded-[var(--radius-card)] border border-rule bg-surface p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <h3 id={`${id}-title`} className="font-display text-lg font-semibold">
          Engine
        </h3>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-source`}>Where the AI runs</Label>
          <select
            id={`${id}-source`}
            className={selectClass}
            value={source}
            onChange={(event) => {
              pick(event.target.value as Source);
            }}
          >
            <option value="webllm">In this browser (no key, nothing leaves)</option>
            <optgroup label="Your own key">
              {KEY_PRESETS.map((p) => (
                <option key={p} value={p}>
                  {PRESETS[p].label}
                </option>
              ))}
            </optgroup>
            <optgroup label="A server on your computer">
              {LOCAL_PRESETS.map((p) => (
                <option key={p} value={p}>
                  {PRESETS[p].label}
                </option>
              ))}
            </optgroup>
          </select>
        </div>

        {source === 'webllm' ? (
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Model</legend>
            {WEBLLM_MODELS.map((m) => (
              <div key={m.id} className="flex min-h-11 items-start gap-3 text-sm">
                <input
                  id={`${id}-${m.id}`}
                  type="radio"
                  name={`${id}-web`}
                  value={m.id}
                  checked={webModel === m.id}
                  aria-describedby={`${id}-${m.id}-hint`}
                  onChange={() => {
                    setWebModel(m.id);
                  }}
                  className="mt-0.5 size-5 accent-[var(--accent)]"
                />
                <div>
                  <label htmlFor={`${id}-${m.id}`} className="font-medium">
                    {m.label}
                  </label>
                  <p id={`${id}-${m.id}-hint`} className="text-muted">
                    The first use downloads {m.download}. It needs about {(m.memoryMb / 1000).toFixed(1)} GB
                    of graphics memory.
                  </p>
                </div>
              </div>
            ))}
            {gpu === false && (
              <p className="text-sm text-accent-text">
                This browser has no WebGPU, so it cannot run a model. Use a recent Chrome or Edge, or pick
                your own key or a server on your computer.
              </p>
            )}
          </fieldset>
        ) : (
          preset && (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor={`${id}-model`}>Model</Label>
                <div className="flex flex-wrap gap-2">
                  <Input
                    id={`${id}-model`}
                    className="min-w-0 flex-1 font-mono text-sm"
                    list={`${id}-models`}
                    value={model}
                    spellCheck={false}
                    autoComplete="off"
                    onChange={(event) => {
                      setModel(event.target.value);
                    }}
                  />
                  <datalist id={`${id}-models`}>
                    {models.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={listing || (preset.listNeedsKey && !hasKey)}
                    onClick={() => {
                      void listModels();
                    }}
                  >
                    {listing ? 'Loading the list' : 'Load the model list'}
                  </Button>
                </div>
                {models.length > 0 && (
                  <p className="text-sm text-muted">{models.length} models. Type to filter the list.</p>
                )}
              </div>
              {preset.local ? (
                <p className="text-sm text-muted">
                  This server needs no key. {localHelp(preset, window.location.origin)}
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span>{hasKey ? 'Key: ready for this tab.' : 'No key for this tab yet.'}</span>
                  <Button
                    ref={keyButton}
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setKeyOpen(true);
                    }}
                  >
                    {hasKey ? 'Change the key' : 'Add a key'}
                  </Button>
                  {preset.keyPage && (
                    <a href={preset.keyPage} target="_blank" rel="noreferrer" className="underline">
                      Get a key from {preset.label}
                    </a>
                  )}
                </div>
              )}
            </>
          )
        )}

        {showDrawer !== null && (
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showDrawer}
              onChange={(event) => {
                setShowDrawer(event.target.checked);
              }}
              className="size-5 accent-[var(--accent)]"
            />
            Show what will be sent before each request
          </label>
        )}
        {error && (
          <p role="alert" className="text-sm text-accent-text">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit">Use this engine</Button>
        </div>
      </form>
      {/* Outside the form: the dialog is a portal, and its own submit must not save the engine. */}
      {/* Each opening mounts it again, so it reads the stored key and the terms again. */}
      {keyOpen && preset && !preset.local && (
        <KeyDialog
          preset={preset.id}
          open
          onOpenChange={(open) => {
            setKeyOpen(open);
            if (!open) requestAnimationFrame(() => keyButton.current?.focus());
          }}
          onReady={refresh}
        />
      )}
    </>
  );
}
