import { expect, test, type Page } from '@playwright/test';
import { skipOnboarding } from './support/onboarding';

/*
 * A short-lived probe for the CI log. It finds which step makes WebKit replace the first sentence when
 * the writer types after using a panel. It logs and does not fail. It goes away once the cause is fixed.
 */

const text = (page: Page) => page.getByRole('textbox', { name: 'Scene 1' });
const scenePicker = (page: Page) => page.getByRole('button', { name: /^Scene:/ });
const sceneRadio = (page: Page, name: string) =>
  page.getByRole('radiogroup', { name: 'Scene' }).getByRole('radio', { name });

async function start(page: Page) {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  await page
    .getByRole('dialog', { name: 'New project' })
    .getByRole('button', { name: 'Create project' })
    .click();
  await expect(text(page)).toBeFocused();
  await page.keyboard.type('The rain began.');
  await expect(text(page)).toContainText('The rain began.');
}

const pickRainyWindow = async (page: Page) => {
  await scenePicker(page).click();
  await sceneRadio(page, 'Rainy window').click();
  await page.mouse.click(5, 5);
  await expect(page.getByRole('radiogroup', { name: 'Scene' })).toBeHidden();
};

/** Adds a style rule to the page, to turn the caret block rule off or to turn content-visibility off. */
const addRule = (rule: string) => async (page: Page) => {
  await page.addStyleTag({ content: rule });
};

const cases: {
  name: string;
  rounds: number;
  log?: boolean;
  before?: (page: Page) => Promise<void>;
  step: (page: Page) => Promise<void>;
}[] = [
  { name: 'scene picked, with the caret block rule', rounds: 3, step: pickRainyWindow },
  {
    name: 'scene picked, caret block rule turned off',
    rounds: 2,
    before: addRule('.vlo-manuscript > .vlo-caret-block { content-visibility: auto !important; }'),
    step: pickRainyWindow,
  },
  {
    name: 'scene picked, every block without content-visibility',
    rounds: 2,
    before: addRule('.vlo-manuscript > * { content-visibility: visible !important; }'),
    step: pickRainyWindow,
  },
];

/** Logs the key, input, selection and DOM events in the editor, for the CI log. */
async function watchEvents(page: Page) {
  await text(page).evaluate((element) => {
    const log: string[] = [];
    (window as unknown as { __probe: string[] }).__probe = log;
    const where = (node: Node | null | undefined, offset: number | undefined) =>
      `${node?.nodeName ?? 'none'}${node?.nodeType === 3 ? JSON.stringify(node.textContent) : ''}@${String(offset)}`;
    const sel = () => {
      const s = window.getSelection();
      return `${s?.type ?? 'none'} ${where(s?.anchorNode, s?.anchorOffset)} to ${where(s?.focusNode, s?.focusOffset)}`;
    };
    element.addEventListener(
      'keydown',
      (e) => {
        log.push(`keydown ${(e as KeyboardEvent).key} | sel ${sel()}`);
      },
      true,
    );
    element.addEventListener(
      'beforeinput',
      (e) => {
        const input = e as InputEvent;
        const ranges = input
          .getTargetRanges()
          .map((r) => `${where(r.startContainer, r.startOffset)}-${where(r.endContainer, r.endOffset)}`)
          .join(', ');
        log.push(
          `beforeinput ${input.inputType} ${JSON.stringify(input.data)} ranges [${ranges}] | sel ${sel()}`,
        );
      },
      true,
    );
    element.addEventListener(
      'input',
      (e) => {
        log.push(`input ${(e as InputEvent).inputType} | html ${element.innerHTML} | sel ${sel()}`);
      },
      true,
    );
    element.addEventListener('focus', () => log.push(`focus | sel ${sel()}`), true);
    element.addEventListener('blur', () => log.push('blur'), true);
    document.addEventListener('selectionchange', () => log.push(`selectionchange ${sel()}`));
    new MutationObserver((records) => {
      for (const r of records) {
        log.push(
          `mutation ${r.type} ${r.target.nodeName} ${r.attributeName ?? ''} old ${JSON.stringify(r.oldValue)} added ${String(r.addedNodes.length)} removed ${String(r.removedNodes.length)}`,
        );
      }
    }).observe(element, {
      subtree: true,
      childList: true,
      characterData: true,
      characterDataOldValue: true,
      attributes: true,
      attributeOldValue: true,
    });
  });
}

for (const probe of cases) {
  for (let round = 1; round <= probe.rounds; round += 1) {
    test(`probe: ${probe.name}, round ${String(round)}`, async ({ page, browserName }) => {
      test.skip(browserName !== 'webkit', 'The probe is for WebKit only.');
      await start(page);
      if (probe.before) await probe.before(page);
      if (probe.log) await watchEvents(page);
      await probe.step(page);
      await text(page).focus();
      await page.keyboard.press('ControlOrMeta+End');
      await page.waitForTimeout(500);
      if (probe.log) {
        await page.evaluate(() =>
          (window as unknown as { __probe: string[] }).__probe.push('--- typing ---'),
        );
        await page.keyboard.type(' I');
        await page.waitForTimeout(200);
        const log = await page.evaluate(() => (window as unknown as { __probe: string[] }).__probe);
        console.log(`[probe-log] ${probe.name}, round ${String(round)}:\n${log.slice(-120).join('\n')}`);
        await page.keyboard.type('t kept on.');
      } else {
        await page.keyboard.type(' It kept on.');
      }
      await page.waitForTimeout(300);
      console.log(
        `[probe] ${probe.name}, round ${String(round)}: ${JSON.stringify(await text(page).innerText())}`,
      );
    });
  }
}
