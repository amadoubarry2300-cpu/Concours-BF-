import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.NODE_ENV = 'test';
const { adminRevisionPayload, publicRevisionFiche } = await import('../backend/server.js?revision-publication-test=1');

const categories = ['Burkina Faso','Culture générale','Histoire-Géo','Mathématiques','Physique-Chimie','Psychotechnique','Français','SVT','Greffier / Droit'];
for (const category of categories){
  const payload = adminRevisionPayload({
    title:`Révision ${category}`,
    category,
    level:'CEP',
    duration:'3 min',
    points:['Point essentiel 1','Point essentiel 2'],
    remember:'Idée principale à mémoriser',
    quizTitle:`QCM ${category}`,
    is_premium:false
  });
  assert.equal(payload.category, category);
}
assert.throws(() => adminRevisionPayload({ title:'Test', category:'Au hasard', points:['A','B'], remember:'À retenir' }), /catégorie/i);
const publicRow = publicRevisionFiche({ id:'test', title:'Titre', category:'Physique-Chimie', points:['A','B'], remember:'R', is_premium:true });
assert.equal(publicRow.category, 'Physique-Chimie');
assert.equal(publicRow.is_premium, true);
assert.match(publicRow.img, /subject-exam\.svg$/);

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
assert.ok(!html.includes('>Fiches courtes<'));
assert.ok(html.includes('>Fiches de révision<'));
assert.ok(html.includes('id="adminRevisionPane"'));
assert.ok(html.includes('id="adminRevisionCategory"'));
for (const category of categories) assert.ok(html.includes(`<option>${category}</option>`), `catégorie absente : ${category}`);
assert.ok(app.includes("'Fiches de révision'"));
assert.ok(app.includes('updateAdminPublicationPreviews'));
console.log('revision publication v21: OK');
