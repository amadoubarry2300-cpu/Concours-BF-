import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.NODE_ENV = 'test';
const { adminRevisionPayload, publicRevisionFiche } = await import('../backend/server.js?revision-publication-test=2');

const categories = ['Burkina Faso','Culture générale','Histoire-Géo','Mathématiques','Physique-Chimie','Psychotechnique','Français','SVT','Greffier / Droit'];
const levels = ['Tous niveaux','CEP','BEPC','CAP / BEP','BAC','BAC+2','Licence','Master','Doctorat'];
const contentTypes = ['Fiche de révision','Notion importante'];
const competitionTypes = ['Concours direct','Concours professionnel','Concours directs et professionnels'];

for (const category of categories){
  const payload = adminRevisionPayload({
    title:`Révision ${category}`,
    category,
    contentType:'Notion importante',
    competitionType:'Concours professionnel',
    level:'CEP',
    duration:'3 min',
    points:['Point essentiel 1','Point essentiel 2'],
    remember:'Idée principale à mémoriser',
    is_premium:false
  });
  assert.equal(payload.category, category);
  assert.equal(payload.content_type, 'Notion importante');
  assert.equal(payload.competition_type, 'Concours professionnel');
  assert.equal(payload.level, 'CEP');
  assert.ok(!Object.hasOwn(payload, 'quizTitle'));
  assert.ok(!Object.hasOwn(payload, 'quiz_title'));
}

const base = { title:'Publication test', category:'Culture générale', points:['Point A','Point B'], remember:'À retenir' };
assert.throws(() => adminRevisionPayload({ ...base, category:'Au hasard' }), /catégorie/i);
assert.throws(() => adminRevisionPayload({ ...base, contentType:'QCM' }), /type de contenu/i);
assert.throws(() => adminRevisionPayload({ ...base, competitionType:'Autre concours' }), /type de concours/i);
assert.throws(() => adminRevisionPayload({ ...base, level:'Niveau aléatoire' }), /niveau/i);
for (const contentType of contentTypes) assert.equal(adminRevisionPayload({ ...base, contentType }).content_type, contentType);
for (const competitionType of competitionTypes) assert.equal(adminRevisionPayload({ ...base, competitionType }).competition_type, competitionType);
for (const level of levels) assert.equal(adminRevisionPayload({ ...base, level }).level, level);

const publicRow = publicRevisionFiche({
  id:'test',
  title:'Titre',
  category:'Physique-Chimie',
  content_type:'Fiche de révision',
  competition_type:'Concours direct',
  level:'BAC',
  points:['A','B'],
  remember:'R',
  is_premium:true
});
assert.equal(publicRow.category, 'Physique-Chimie');
assert.equal(publicRow.contentType, 'Fiche de révision');
assert.equal(publicRow.competitionType, 'Concours direct');
assert.equal(publicRow.level, 'BAC');
assert.equal(publicRow.is_premium, true);
assert.match(publicRow.img, /subject-exam\.svg$/);
assert.ok(!Object.hasOwn(publicRow, 'quizTitle'));

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('../backend/server.js', import.meta.url), 'utf8');
const publicHtml = fs.readFileSync(new URL('../backend/public/index.html', import.meta.url), 'utf8');
const publicApp = fs.readFileSync(new URL('../backend/public/js/app.js', import.meta.url), 'utf8');

assert.ok(!html.includes('>Fiches courtes<'));
assert.ok(html.includes('>Fiches de révision<'));
assert.ok(html.includes('id="adminRevisionPane"'));
for (const id of ['adminRevisionCategory','adminRevisionContentType','adminRevisionCompetitionType','adminRevisionLevel','adminRevisionPremium']) {
  assert.ok(html.includes(`id="${id}"`), `sélecteur absent : ${id}`);
}
for (const category of categories) assert.ok(html.includes(`<option>${category}</option>`), `catégorie absente : ${category}`);
for (const level of levels) assert.ok(html.includes(`<option>${level}</option>`), `niveau absent : ${level}`);
for (const value of [...contentTypes, ...competitionTypes]) assert.ok(html.includes(`<option>${value}</option>`), `choix absent : ${value}`);

for (const source of [html, app, server, publicHtml, publicApp]) {
  assert.ok(!source.includes('Lancer un QCM lié'));
  assert.ok(!source.includes('adminRevisionQuizTitle'));
  assert.ok(!source.includes('quizTitle:`QCM'));
}
assert.ok(!app.includes('const REVISION_FICHES'));
assert.ok(!app.includes('function startRevisionQuiz'));
assert.ok(app.includes('Aucune fiche publiée pour le moment'));
assert.ok(app.includes("filterRow.style.display = hasFiches ? '' : 'none'"));
assert.ok(app.includes("progress.style.display = hasFiches ? '' : 'none'"));
assert.ok(app.includes("openPremium('les fiches de révision Premium')"));
assert.ok(server.includes("app.delete('/api/admin/revision-fiches/:id'"));
assert.ok(server.includes('await saveRevisionIndex(nextRows)'));
assert.equal(html, publicHtml, 'miroir index.html désynchronisé');
assert.equal(app, publicApp, 'miroir app.js désynchronisé');
console.log('revision publication v22: OK');
