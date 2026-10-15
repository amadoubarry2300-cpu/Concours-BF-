#!/usr/bin/env node
import fs from 'node:fs';

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const html = fs.readFileSync(new URL('../backend/public/index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../backend/public/css/styles.css', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../backend/public/js/app.js', import.meta.url), 'utf8');

const targets = [...html.matchAll(/data-menu-target="([^"]+)"/g)].map(match => match[1]);
assert(targets.length === 12, `nombre de rubriques du menu : ${targets.length}`);
assert(new Set(targets).size === targets.length, 'rubriques du menu dupliquées');
['home','formations','publishedqcm','resources','revision','news','passport','stats','subscription','account','contact','admin']
  .forEach(target => assert(targets.includes(target), `rubrique absente : ${target}`));
['tone-home','tone-training','tone-qcm','tone-documents','tone-revision','tone-news','tone-passport','tone-progress','tone-premium','tone-account','tone-help','tone-admin']
  .forEach(tone => assert(html.includes(tone), `couleur absente : ${tone}`));
assert(html.includes('id="appMenu"') && html.includes(' inert>'), 'menu fermé non neutralisé');
assert(css.includes('@keyframes menuCardIn'), 'animation des rubriques absente');
assert(css.includes('@media(prefers-reduced-motion:reduce)'), 'réduction des animations absente');
assert(css.includes('contain:layout paint style'), 'optimisation du rendu du menu absente');
assert(css.includes('white-space:normal'), 'libellés complets non garantis');
assert(app.includes("menu.toggleAttribute('inert', !active)"), 'état actif du menu incomplet');
assert(app.includes("card.classList.toggle('is-current', selected)"), 'rubrique courante non signalée');
console.log('MENU COLORÉ ET FLUIDE OK — 12 rubriques');
