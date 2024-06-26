// SPDX-FileCopyrightText: 2024 Andrew Krigline & Cameron East
//
// SPDX-License-Identifier: MIT
import { CompactBeyond5e } from './foundryvtt-compactBeyond5eSheet.mjs';

/**
 * Extend the basic ActorSheet with some customizations to use our own templates and styles
 */
//eslint-disable-next-line no-undef
export class CompactBeyond5eSheet extends dnd5e.applications.actor.ActorSheet5eCharacter {
  constructor() {
    super(...arguments);
    this._debouncedSearchFilter = foundry.utils.debounce(this._handleSearchFilter, 200);
  }
  get template() {
    if (
      !game.user?.isGM &&
      this.actor.limited &&
      !game.settings.get(CompactBeyond5e.MODULE_ID, CompactBeyond5e.SETTINGS.expandedLimited)
    ) {
      return `modules/${CompactBeyond5e.MODULE_ID}/templates/character-sheet-ltd.hbs`;
    }

    return `modules/${CompactBeyond5e.MODULE_ID}/templates/character-sheet.hbs`;
  }

  static get defaultOptions() {
    const options = super.defaultOptions;

    // inject our own css class and filter options
    foundry.utils.mergeObject(options, {
      classes: [...options.classes, 'cb5es'],
      scrollY: [...options.scrollY, '.sheet-sidebar'],
      height: 680,
      filters: [
        {
          inputSelector: '.spellbook input.filter',
          contentSelector: '.spellbook .inventory-list',
        },
        {
          inputSelector: '.inventory input.filter',
          contentSelector: '.inventory .inventory-list',
        },
        {
          inputSelector: '.features input.filter',
          contentSelector: '.features .inventory-list',
        },
      ],
      // template: `modules/${CompactBeyond5e.MODULE_ID}/templates/character-sheet.hbs`,
    });

    return options;
  }

  _handleSearchFilter(event, query, rgx, html) {
    let anyMatch = !query;
    const itemRows = html.querySelectorAll('.item-list > .item');
    //eslint-disable-next-line no-undef
    // log(false, 'onSearchFilter firing', {
    //   query,
    //   rgx,
    //   html,
    //   itemRows,
    // });
    for (let li of itemRows) {
      if (!query) {
        li.classList.remove('hidden');
        continue;
      }
      const title = li.querySelector('.item-name')?.textContent;
      if (!title) {
        continue;
      }
      const match = rgx.test(SearchFilter.cleanQuery(title));
      li.classList.toggle('hidden', !match);
      if (match) {
        //eslint-disable-next-line no-unused-vars
        anyMatch = true;
      }
    }
  }

  /** @override */
  _onSearchFilter(...args) {
    this._debouncedSearchFilter(...args);
  }

  /**
   * Inject the actions list into the actions tab before the render cycle completes
   */
  async _renderInner(...args) {
    const html = await super._renderInner(...args);
    const actionsListApi = game.modules.get('character-actions-list-5e')?.api;

    try {
      const actionsTab = html.find('.actions');

      const actionsTabHtml = await actionsListApi?.renderActionsList(this.actor);

      actionsTab.html(actionsTabHtml);
    } catch (e) {
      CompactBeyond5e.log(true, e);
    }

    return html;
  }

  /**
   * Method to calculate the spell attack modifier
   */
  _getSpellAttackMod() {
    const { abilities, attributes, bonuses } = this.actor.system;

    // calculate the spell attack modifier
    let spellAttackModFormula = [
      new Intl.NumberFormat('en-US', {
        signDisplay: 'exceptZero',
      })
        .format((abilities[attributes.spellcasting || 'int']?.mod ?? 0) + attributes.prof)
        .toString(),
    ];

    // apply the bonuses if they are equivalent
    if (bonuses.msak.attack === bonuses.rsak.attack) {
      spellAttackModFormula.push(bonuses.msak.attack || 0);
    } else if (!!bonuses.msak.attack && !!bonuses.rsak.attack) {
      const formulaA = new Roll(bonuses.msak.attack);
      const formulaB = new Roll(bonuses.rsak.attack);

      // apply the lesser deterministic bonus
      if (formulaA.isDeterministic && formulaB.isDeterministic) {
        let lesserBonus = Math.min(
          formulaA.evaluate({ async: false }).total,
          formulaB.evaluate({ async: false }.total)
        );
        spellAttackModFormula.push(lesserBonus || 0);
      }
    }

    return spellAttackModFormula.length === 1
      ? spellAttackModFormula[0]
      : //eslint-disable-next-line no-undef
        dnd5e.dice.simplifyRollFormula(spellAttackModFormula.join(' + '));
  }

  /**
   * Extend and override the sheet data
   */
  async getData() {
    const sheetData = await super.getData();

    const { abilities, attributes, bonuses, details } = this.actor.system;

    const lockSheetsEnabled = game.settings.get(CompactBeyond5e.MODULE_ID, CompactBeyond5e.SETTINGS.lockSheets);

    const options = {
      locked: lockSheetsEnabled ? CompactBeyond5e.isLocked(this.actor._id) ?? true : false,
    };

    if (lockSheetsEnabled) {
      CompactBeyond5e.bindLock(this.actor._id);
    }

    sheetData.options = options;

    sheetData.moduleFilePath = `modules/${CompactBeyond5e.MODULE_ID}/`;
    sheetData.nextLevel = details.level + 1;

    sheetData.spellAttackMod = this._getSpellAttackMod();
    sheetData.spellSaveDcWithMods = attributes.spelldc + bonuses.spell.dc;

    // simplify the formula and apply if it is a string
    if (typeof sheetData.spellSaveDcWithMods === 'string') {
      //eslint-disable-next-line no-undef
      sheetData.spellSaveDcWithMods = dnd5e.dice.simplifyRollFormula(sheetData.spellSaveDcWithMods);
    }

    CompactBeyond5e.log(false, {
      abilities: abilities,
      ability: abilities[attributes.spellcasting || 'int'],
      mod: abilities[attributes.spellcasting || 'int']?.mod ?? 0,
      prof: attributes.prof,
      spellAttackMod: sheetData.spellAttackMod,
      options: options,
    });

    return sheetData;
  }
}
