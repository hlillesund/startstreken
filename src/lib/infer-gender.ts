export function inferGenderFromCategory(category: string | null | undefined): string | null {
  if (!category) return null;
  const c = category.trim();
  if (/^[Mm]/.test(c)) return "M";
  if (/^[FfKk]/.test(c)) return "F";
  return null;
}

export function inferGenderFromName(displayName: string | null | undefined): string | null {
  if (!displayName) return null;
  const first = displayName.trim().split(/\s+/)[0];

  const male = new Set([
    "Magnus","Sebastian","Lars","Olav","Alexander","Henrik","Kasper","Daniel","William",
    "Tobias","Andreas","Ulrik","Simon","Anders","Aksel","Noah","Oliver","Ole","Martin",
    "Matheo","Elias","Gabriel","Lucas","Mathias","Mads","Jonas","Markus","Jonathan",
    "Marius","Are","Jakob","Teodor","Felix","Samuel","Vilmer","Erik","Thomas","Christian",
    "Kristian","Håkon","Vegard","Bjørn","Steinar","Terje","Geir","Svein","Rune","Petter",
    "Stian","Espen","Trond","Morten","Knut","Eirik","Eivind","Sondre","Sindre","Joakim",
    "Mikael","Michael","Karl","Per","Jon","Jan","Tor","Odd","Ove","Frode","Vidar","Roar",
    "Gunnar","Leif","Ivar","Sigurd","Audun","Øyvind","Øystein","Halvard","Runar","Tore",
    "Atle","Alf","Tomas","Nikolai","Patrick","Adrian","Victor","Vincent","Ludvig","Emil",
    "Sander","Isak","Axel","Max","Oscar","Liam","Nils","Jens","Hans","Truls","Bent","Dag",
    "Finn","Kjetil","Ronny","Remi","Robin","Kim","Tommy","Tony","Johnny","Jimmy","Fredrik",
    "Phillip","Filip","Christoffer","Christopher","Aleksander","Mikkel","Nicolai","Rasmus",
    "Bastian","Benjamin","Marcus","Alfred","Johannes","Anton","Theo","Jørgen","Frederik",
    "Fabian","Luca","Odin","Stig","Carl","Endre","Niels","Theodor","Arne","Rafael","Stefan",
    "Valdemar","Sverre","Håvard","Jostein","Harald","Halvor","Narve","Aslak","Gustav",
    "Sem","Abel","Anthony","Heming","Konrad","Matias","Niklas","Ketil","Nicklas","Theis",
    "Jacob","Julius","Brage","Helmer","Lukas","Dennis","Bendik","Magne","Frank","Marc",
    "Nicolas","Folke","Haakon","Torkel","Tallak","Tormod","Lennard","Stephan","Sveinung",
    "Otto","Marco","Joar","Gudbrand","Vincenzo","Florian","Tyler","Casper","Laurits",
    "Maximilian","Willy","Ronnie","Herman","David","Jesper","Leon","Søren","John","Hugo",
    "Peder","August","Julian","Peter","Even","Storm","Dan-Olav","Connor","James","Philip",
    "Leiv","Ejvind","Lester","Troy","Luka","Arvid","Matti","Tim","Njord","Alex","Sejr",
    "Evert","Falk","Sveinung","Ørjan","Ole-Andreas","Hjalte","Ådne","Styrk","Orgil",
  ]);

  const female = new Set([
    "Ingrid","Maria","Helle","Sofie","Madeleine","Julie","Caroline","Amalie","Hedda",
    "Olivia","Emma","Vilde","Tomine","Malena","Hanna","Anna","Ulla","Evgenia","Erle",
    "Line","Lene","Tone","Trine","Silje","Siri","Kari","Anne","Nina","Ida","Sara","Sarah",
    "Camilla","Marit","Astrid","Guro","Marte","Marta","Katrine","Kristine","Kristina",
    "Christina","Christine","Elisabeth","Elizabeth","Anette","Annette","Karianne",
    "Marianne","Linn","Linda","Lisa","Mia","Maja","Nora","Thea","Tea","Lea","Leah",
    "Emilie","Emily","Mathilde","Matilde","Frida","Frøya","Sigrid","Solveig","Ragnhild",
    "Helene","Helena","Henriette","Heidi","Hilde","Grete","Grethe","Berit","Brit","Britt",
    "Bodil","Bjørg","Vigdis","Wenche","Toril","Tove","Turid","Unni","Vera","Vibeke","Åse",
    "Renate","Stine","Susanne","Sandra","Signe","Siv","Synne","Synnøve","Therese","Theresa",
    "Veronica","Victoria","Viktoria","Yasmin","Ylva","Yvonne","Benedicte","Cecilie","Cecilia",
    "Charlotte","Clara","Klara","Dina","Diana","Ella","Ellen","Elsa","Aurora","Filippa",
    "Hannah","Iben","Iris","Isabel","Isabella","Isabell","Iselin","Jenny","Jessica","Johanne",
    "Josefine","Josephine","Kaja","Karen","Karoline","Katja","Laila","Laura","Linnea","Lise",
    "Louise","Luna","Lydia","Malin","Mari","Marion","Mette","Merete","Monica","Monika","Mona",
    "Nathalie","Natalie","Nicoline","Nicole","Petra","Pia","Randi","Rebecca","Rebekka",
    "Reidun","Runa","Ruth","Selma","Sissel","Sonja","Trude","Tuva","Unn","Øydis","Karla",
    "Agnes","Thelma","Helga","Johanna","Rosa","Megan","Cathrine","Anneke","Anja","Ingerid",
    "Andrea","Hazel","Ellinor","Happiness","Oda","Ea","Wendy","Åsa","Alexandra","Mina",
    "Simone","Tiril","Cornelia","Ada","Kate","Marie","Julia","Amanda","Lara","Eva","Kirsten",
    "Lieve","Anine","Tilda","Vanessa","Nanna","Saga","Lois","Fredrikke","Natasja","Alea",
    "Claudia","Denise","Lærke","Beth","Jina","Asha","Venche","Roberta","Janka","Tilde",
    "Ineta","Sanne","Viola","Karine","Martha","Vilma","Mildred","Anita","Maia","Petunia",
    "Cecile","Ansa","Clarinda","Alva","Celine","Lena","Bella","Ane","Amie","Mary","Sue",
    "Kathy","Anika","Shinae","Enja","Mila","Elida","Sharon","Anniken","Liva","Isafold",
    "Kristin","Annamarie","Theona","Olga","Vanja","Jacqueline","Mercedes","Serine","Terese",
    "Anke","Leana","Matilda","Kaisa","Tania","Portia","Sandy","Carole","Edel","Mathea",
    "Jannike","Maiken","Lykke","Bronwyn","Carolyn","Leone","Lauren","Danielle","Didi",
    "Estelle","Daniela","Esther","Melanie","Carla","Carina","Emilija","Melissa","Chrissie",
    "Adelia","Tonje","Rina","Elani","Mavis","Frederikke","Racheal","Lilly","Hanne","Kayla",
    "Erica","Pernille","Millie","Kajsa","Nele","Ragne","Leonora","Elize","Mimi","Kjersti",
    "Tina","Jane","Eli","Abbey","Dusica","Lizet","Eve","Nila","Evelin","Lilja","Marike",
    "Vendela","Nonhlanhla","Nosipho","Refiloe","Sibusisiwe","Rhulani","Boitumelo","Rethabile",
    "Palesa","Keneilwe","Itumeleng","Mangalisile","Kholiwe","Rejoice","Elelwani","Namrah",
    "Nonzwakazi","Lithetha","Thabile","Nontokozo","Mmaphuti","Nokwethemba","Mmaphefo",
    "Pelonomi","Nobuhle","Nkhensani","Mmathelo","Nosiphiwe","Mmabatho","Modiehi","Ntonto",
    "Estelize","Sibongile","Kefilwe","Dannisha","Yindi","Thembisile","Noloyiso","Noluthando",
    "Nomawethu","Nqabakazi","Tonia","Lerato","Zoleka","Cilia","Gugu","Pamela","Khanyii",
    "Una","Debbie","Lulama","Nomlindo","Thuli","Violet","Zandile","Lwandle","Boipelo",
    "Nonto","Mahlako","Hlalisile","Nkele","Nkwele","Nokhaya","Landela","Dikeledi",
    "Fulufhelo","Nolene","Motshidisi","Jody","Lani","Precious","Phuti","Nox","Rivoningo",
    "Moretlo","Sewela","Masego","Morongwa","Mapula","Lungile","Abongile","Fundiswa",
    "Anathi","Tinyiko","Mbali","Ndivhuwo","Thandeka","Rendani",
  ]);

  if (male.has(first)) return "M";
  if (female.has(first)) return "F";
  return null;
}

export function inferGender(
  category: string | null | undefined,
  displayName: string | null | undefined
): string | null {
  return inferGenderFromCategory(category) ?? inferGenderFromName(displayName);
}