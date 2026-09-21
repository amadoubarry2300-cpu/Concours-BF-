/* ============ FasoPrépa — banque de questions ============ */
/* Chaque question : { c: catégorie, q: question, o: [4 options], a: index bonne réponse, e: explication } */
const QUESTIONS = [
  // ---- Burkina Faso ----
  {c:"Burkina Faso", q:"Combien de provinces compte le Burkina Faso ?", o:["45","47","49","13"], a:1, e:"Le Burkina Faso compte 47 provinces, réparties dans 13 régions administratives (avant la réorganisation de 2025 en 17 régions)."},
  {c:"Burkina Faso", q:"Quelle est la capitale du Burkina Faso ?", o:["Bobo-Dioulasso","Koudougou","Ouagadougou","Banfora"], a:2, e:"Ouagadougou est la capitale politique et administrative du Burkina Faso."},
  {c:"Burkina Faso", q:"En quelle année la Haute-Volta a-t-elle obtenu son indépendance ?", o:["1958","1960","1962","1966"], a:1, e:"La Haute-Volta est devenue indépendante le 5 août 1960, avec Maurice Yaméogo comme premier président."},
  {c:"Burkina Faso", q:"Qui a rebaptisé la Haute-Volta en « Burkina Faso » ?", o:["Blaise Compaoré","Thomas Sankara","Maurice Yaméogo","Sangoulé Lamizana"], a:1, e:"Le 4 août 1984, Thomas Sankara a renommé le pays « Burkina Faso », la « Patrie des hommes intègres »."},
  {c:"Burkina Faso", q:"Quel est le plus long fleuve du Burkina Faso ?", o:["Le Mouhoun","Le Nazinon","Le Nakambé","La Comoé"], a:0, e:"Le Mouhoun (ex-Volta Noire) est le plus long fleuve du pays, et le seul permanent."},
  {c:"Burkina Faso", q:"Quelle est la deuxième ville du Burkina Faso ?", o:["Koudougou","Ouahigouya","Bobo-Dioulasso","Fada N'Gourma"], a:2, e:"Bobo-Dioulasso, capitale économique, est la deuxième ville du pays."},
  {c:"Burkina Faso", q:"Que signifie « Burkina Faso » ?", o:["Terre des braves","Patrie des hommes intègres","Pays des savanes","Terre de nos ancêtres"], a:1, e:"« Burkina » (mooré) signifie intègre, « Faso » (dioula) signifie patrie : la Patrie des hommes intègres."},
  {c:"Burkina Faso", q:"Quel est l'hymne national du Burkina Faso ?", o:["La Voltaïque","Le Ditanyè","L'Abidjanaise","Le Faso Dan Fani"], a:1, e:"Le Ditanyè (l'Hymne de la victoire), écrit par Thomas Sankara, est l'hymne national depuis 1984."},
  {c:"Burkina Faso", q:"Quelle monnaie est utilisée au Burkina Faso ?", o:["Le franc guinéen","Le cedi","Le franc CFA","Le naira"], a:2, e:"Le Burkina Faso utilise le franc CFA (XOF), monnaie commune de l'UEMOA."},
  {c:"Burkina Faso", q:"Le pic de Ténakourou, point culminant du pays, mesure environ :", o:["517 m","649 m","749 m","1 024 m"], a:2, e:"Le Ténakourou culmine à 749 m, à la frontière avec le Mali, dans la province du Kénédougou."},
  {c:"Burkina Faso", q:"Quelle date marque la fête nationale du Burkina Faso ?", o:["5 août","4 août","11 décembre","15 octobre"], a:2, e:"Le 11 décembre commémore la proclamation de la République de Haute-Volta en 1958."},
  {c:"Burkina Faso", q:"Le FESPACO est un festival consacré :", o:["À la musique","Au cinéma","À l'artisanat","Au théâtre"], a:1, e:"Le Festival panafricain du cinéma et de la télévision de Ouagadougou est le plus grand festival de cinéma d'Afrique."},

  // ---- Histoire-Géographie ----
  {c:"Histoire-Géo", q:"En quelle année a débuté la Première Guerre mondiale ?", o:["1912","1914","1916","1918"], a:1, e:"La Première Guerre mondiale a éclaté en 1914 et s'est achevée en 1918."},
  {c:"Histoire-Géo", q:"Quel est le plus grand désert chaud du monde ?", o:["Le Kalahari","Le Sahara","Le Gobi","L'Atacama"], a:1, e:"Le Sahara couvre environ 9 millions de km², soit près du tiers du continent africain."},
  {c:"Histoire-Géo", q:"La conférence de Berlin (1884-1885) portait sur :", o:["La fin de l'esclavage","Le partage de l'Afrique","La création de l'ONU","La guerre froide"], a:1, e:"La conférence de Berlin a organisé le partage de l'Afrique entre puissances européennes."},
  {c:"Histoire-Géo", q:"Quel fleuve traverse le plus de pays en Afrique de l'Ouest ?", o:["Le Sénégal","La Volta","Le Niger","La Gambie"], a:2, e:"Le fleuve Niger (4 180 km) traverse notamment la Guinée, le Mali, le Niger et le Nigeria."},
  {c:"Histoire-Géo", q:"Qui fut le premier président du Ghana indépendant ?", o:["Jerry Rawlings","Kwame Nkrumah","Jomo Kenyatta","Sékou Touré"], a:1, e:"Kwame Nkrumah a conduit le Ghana à l'indépendance en 1957, premier pays d'Afrique subsaharienne décolonisé."},
  {c:"Histoire-Géo", q:"L'ONU a été créée en :", o:["1919","1945","1948","1960"], a:1, e:"L'Organisation des Nations unies a été fondée le 24 octobre 1945, après la Seconde Guerre mondiale."},
  {c:"Histoire-Géo", q:"Quel pays africain n'a jamais été colonisé ?", o:["Le Libéria","L'Éthiopie","Les deux","Aucun"], a:2, e:"L'Éthiopie et le Libéria sont considérés comme les deux pays africains jamais durablement colonisés."},
  {c:"Histoire-Géo", q:"La CEDEAO a été créée en :", o:["1963","1975","1980","1994"], a:1, e:"La Communauté économique des États de l'Afrique de l'Ouest a été fondée le 28 mai 1975 à Lagos."},

  // ---- Culture générale ----
  {c:"Culture générale", q:"Combien de continents compte la Terre ?", o:["4","5","6","7"], a:2, e:"On compte généralement 6 continents : Afrique, Amérique, Antarctique, Asie, Europe, Océanie."},
  {c:"Culture générale", q:"Quelle est la langue la plus parlée au monde (locuteurs natifs) ?", o:["L'anglais","Le mandarin","L'espagnol","Le hindi"], a:1, e:"Le chinois mandarin compte environ 950 millions de locuteurs natifs."},
  {c:"Culture générale", q:"Qui a écrit « Les Misérables » ?", o:["Émile Zola","Victor Hugo","Balzac","Molière"], a:1, e:"Victor Hugo a publié Les Misérables en 1862."},
  {c:"Culture générale", q:"Quel organe pompe le sang dans le corps humain ?", o:["Le foie","Les poumons","Le cœur","Les reins"], a:2, e:"Le cœur est le muscle qui propulse le sang dans tout l'organisme."},
  {c:"Culture générale", q:"Combien y a-t-il de joueurs dans une équipe de football sur le terrain ?", o:["9","10","11","12"], a:2, e:"Une équipe de football aligne 11 joueurs, gardien compris."},
  {c:"Culture générale", q:"Quel est le symbole chimique de l'or ?", o:["Or","Au","Ag","Go"], a:1, e:"Au vient du latin « aurum », qui signifie or."},
  {c:"Culture générale", q:"Le siège de l'Union Africaine se trouve à :", o:["Abuja","Addis-Abeba","Nairobi","Le Caire"], a:1, e:"Le siège de l'UA est à Addis-Abeba, en Éthiopie."},
  {c:"Culture générale", q:"Quelle est la planète la plus proche du Soleil ?", o:["Vénus","Mars","Mercure","La Terre"], a:2, e:"Mercure est la planète la plus proche du Soleil, à environ 58 millions de km."},
  {c:"Culture générale", q:"Qui a peint « La Joconde » ?", o:["Picasso","Michel-Ange","Léonard de Vinci","Van Gogh"], a:2, e:"Léonard de Vinci a peint la Joconde au début du XVIe siècle."},

  // ---- Mathématiques ----
  {c:"Mathématiques", q:"Quelle est la valeur de 7 × 8 ?", o:["54","56","58","64"], a:1, e:"7 × 8 = 56."},
  {c:"Mathématiques", q:"Un triangle rectangle possède un angle de :", o:["45°","60°","90°","180°"], a:2, e:"Un triangle rectangle possède un angle droit, c'est-à-dire de 90°."},
  {c:"Mathématiques", q:"La racine carrée de 144 est :", o:["10","11","12","14"], a:2, e:"12 × 12 = 144, donc √144 = 12."},
  {c:"Mathématiques", q:"25 % de 200 égale :", o:["25","40","50","75"], a:2, e:"25 % = 1/4, et 200 ÷ 4 = 50."},
  {c:"Mathématiques", q:"Quel est le périmètre d'un carré de côté 6 cm ?", o:["12 cm","24 cm","36 cm","18 cm"], a:1, e:"Périmètre du carré = 4 × côté = 4 × 6 = 24 cm."},
  {c:"Mathématiques", q:"La somme des angles d'un triangle vaut :", o:["90°","180°","270°","360°"], a:1, e:"Dans un triangle, la somme des trois angles vaut toujours 180°."},
  {c:"Mathématiques", q:"Si x + 5 = 12, alors x = ?", o:["5","6","7","17"], a:2, e:"x = 12 − 5 = 7."},

  // ---- SVT ----
  {c:"SVT", q:"Quel gaz les plantes absorbent-elles pour la photosynthèse ?", o:["L'oxygène","Le dioxyde de carbone","L'azote","L'hydrogène"], a:1, e:"Les plantes absorbent le CO₂ et rejettent de l'oxygène grâce à la photosynthèse."},
  {c:"SVT", q:"Combien de chromosomes possède une cellule humaine normale ?", o:["23","44","46","48"], a:2, e:"L'être humain possède 46 chromosomes, soit 23 paires."},
  {c:"SVT", q:"Le paludisme est transmis par :", o:["L'eau sale","Le moustique anophèle femelle","La mouche tsé-tsé","Le contact direct"], a:1, e:"Le paludisme est transmis par la piqûre du moustique anophèle femelle infecté."},
  {c:"SVT", q:"Quel est l'organe principal de la respiration ?", o:["Le cœur","Le foie","Les poumons","L'estomac"], a:2, e:"Les poumons assurent les échanges gazeux entre l'air et le sang."},
  {c:"SVT", q:"Les os sont reliés aux muscles par :", o:["Les tendons","Les ligaments","Les nerfs","Les cartilages"], a:0, e:"Les tendons relient les muscles aux os ; les ligaments relient les os entre eux."},

  // ---- Français ----
  {c:"Français", q:"Quel est le pluriel de « cheval » ?", o:["Chevals","Chevaux","Chevaus","Chevales"], a:1, e:"Les mots en -al font généralement leur pluriel en -aux : cheval → chevaux."},
  {c:"Français", q:"« Rapidement » est :", o:["Un adjectif","Un adverbe","Un nom","Une conjonction"], a:1, e:"Les mots en -ment formés sur un adjectif sont des adverbes de manière."},
  {c:"Français", q:"Le passé simple de « il fait » est :", o:["Il faisait","Il fit","Il fera","Il a fait"], a:1, e:"Le passé simple du verbe faire à la 3e personne du singulier est « il fit »."},
  {c:"Français", q:"Un synonyme de « effrayé » est :", o:["Courageux","Apeuré","Joyeux","Calme"], a:1, e:"« Apeuré » signifie saisi par la peur, comme « effrayé »."},
  {c:"Français", q:"Combien de temps composés y a-t-il à l'indicatif ?", o:["2","3","4","5"], a:2, e:"L'indicatif compte 4 temps composés : passé composé, plus-que-parfait, passé antérieur, futur antérieur."},

  // ---- Psychotechnique ----
  {c:"Psychotechnique", q:"Complétez la suite : 2, 4, 8, 16, ... ?", o:["18","24","32","64"], a:2, e:"Chaque terme est le double du précédent : 16 × 2 = 32."},
  {c:"Psychotechnique", q:"Si LUNDI = 5 lettres, MERCREDI = ?", o:["7","8","9","10"], a:1, e:"MERCREDI contient 8 lettres."},
  {c:"Psychotechnique", q:"Complétez : 1, 1, 2, 3, 5, 8, ... ?", o:["11","12","13","15"], a:2, e:"Suite de Fibonacci : chaque terme est la somme des deux précédents (5 + 8 = 13)."},
  {c:"Psychotechnique", q:"Un train part à 8h15 et arrive à 10h40. Durée du trajet ?", o:["2h15","2h25","2h35","1h25"], a:1, e:"De 8h15 à 10h15 = 2h, puis de 10h15 à 10h40 = 25 min, soit 2h25."},
  {c:"Psychotechnique", q:"Quel mot est l'intrus ?", o:["Mangue","Banane","Carotte","Orange"], a:2, e:"La carotte est un légume, les autres sont des fruits."},
];

const CATEGORIES = [...new Set(QUESTIONS.map(q => q.c))];
