#!/usr/bin/env node
process.env.NODE_ENV='test';
const { isDirectProfessionalCompetitionNews, normalizeOfficialNewsDraft } = await import('../backend/server.js');
const assert=(condition,message)=>{ if(!condition) throw new Error(message); };

assert(isDirectProfessionalCompetitionNews('Ouverture des concours directs de la fonction publique, session 2026'), 'concours direct rejeté');
assert(isDirectProfessionalCompetitionNews('Résultats du concours professionnel publiés sur eConcours-pro'), 'concours professionnel rejeté');
assert(isDirectProfessionalCompetitionNews('Liste des candidats au concours de recrutement de contrôleurs'), 'concours de recrutement rejeté');
assert(!isDirectProfessionalCompetitionNews('Enseignement supérieur : le Premier ministre reçoit les ministres de l’AES et du Togo — communiqué du Gouvernement'), 'actualité générale acceptée');
assert(!isDirectProfessionalCompetitionNews('Recrutement d’un consultant pour un marché public'), 'recrutement hors concours accepté');
assert(!isDirectProfessionalCompetitionNews('Conférence des responsables des institutions d’enseignement supérieur'), 'conférence acceptée');

const cleaned=normalizeOfficialNewsDraft({
  title:'Concours directs 2026',
  summary:'&lt;a href="https://example.test"&gt;Inscriptions ouvertes&lt;/a&gt; -mask\'>',
  content:'<b>Communiqué</b> sans balise',
  sourceUrl:'https://www.econcours.gov.bf/',
  sourceName:'eConcours'
});
assert(!/[<>]|href=|-mask/i.test(cleaned.summary), 'HTML résiduel dans le résumé');
assert(cleaned.summary.includes('Inscriptions ouvertes'), 'texte utile supprimé');
assert(cleaned.content==='Communiqué sans balise', 'contenu HTML mal nettoyé');
console.log('FILTRE CONCOURS DIRECTS/PROFESSIONNELS OK');
