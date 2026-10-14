#!/usr/bin/env node
process.env.NODE_ENV = 'test';
const { isDirectProfessionalCompetitionNews, extractOfficialCandidates, normalizeOfficialNewsDraft } = await import('../backend/server.js');
const assert = (condition, message) => { if (!condition) throw new Error(message); };

assert(isDirectProfessionalCompetitionNews('Ouverture des concours directs de la fonction publique, session 2026'), 'concours direct rejeté');
assert(isDirectProfessionalCompetitionNews('Résultats du concours professionnel publiés sur eConcours-pro'), 'concours professionnel rejeté');
assert(isDirectProfessionalCompetitionNews('Liste des candidats au concours de recrutement de contrôleurs', 'Ministère de la Fonction publique — Concours'), 'concours de la fonction publique rejeté');
assert(isDirectProfessionalCompetitionNews('Résultats d’admissibilité, session 2026', 'https://www.econcours-pro.gov.bf/'), 'résultat eConcours professionnel rejeté');
assert(!isDirectProfessionalCompetitionNews('Liste des candidats au concours de recrutement de contrôleurs'), 'concours non rattaché à la fonction publique accepté');
assert(!isDirectProfessionalCompetitionNews('Enseignement supérieur : le Premier ministre reçoit les ministres de l’AES et du Togo — communiqué du Gouvernement'), 'actualité générale acceptée');
assert(!isDirectProfessionalCompetitionNews('Recrutement d’un consultant pour un marché public'), 'recrutement hors concours accepté');
assert(!isDirectProfessionalCompetitionNews('Conférence des responsables des institutions d’enseignement supérieur'), 'conférence acceptée');

const syntheticPage = {
  name:'Ministère de la Fonction publique — Concours',
  url:'https://www.fonction-publique.gov.bf/accueil/actualites',
  html:`
    <nav>Concours directs et professionnels — session 2026</nav>
    <article><a href="/politique-aes-2026">Enseignement supérieur : le Premier ministre reçoit les ministres de l’AES et du Togo</a><time>14 octobre 2026</time></article>
    <article><a href="/concours-directs-2026">Ouverture des concours directs de la fonction publique, session 2026</a><time>14 octobre 2026</time></article>
  `
};
const extracted = extractOfficialCandidates(syntheticPage, new Date('2026-10-14T12:00:00Z'));
assert(extracted.length === 1, `le contexte de page a contaminé ${extracted.length} liens`);
assert(extracted[0].title.includes('concours directs'), 'le concours direct conforme n’a pas été extrait');

const dirty = normalizeOfficialNewsDraft({
  title:'&lt;b&gt;Concours directs 2026&lt;/b&gt;',
  summary:'&lt;a href=&quot;/x&quot;&gt;Ouverture officielle&lt;/a&gt; -mask\'>',
  content:'<div>Inscriptions &amp; calendrier</div>',
  sourceUrl:'https://www.econcours.gov.bf/',
  sourceName:'eConcours'
});
assert(dirty.title === 'Concours directs 2026', `titre HTML mal nettoyé: ${dirty.title}`);
assert(!/[<>]|href=|mask/i.test(`${dirty.summary} ${dirty.content}`), 'fragment HTML résiduel');

console.log('FILTRE CONCOURS DIRECTS/PROFESSIONNELS OK');
