export type CountryOption = {
  code: string;
  name: string;
  aliases?: string[];
};

export const TURKEY_COUNTRY: CountryOption = {
  code: "TR",
  name: "Türkiye",
  aliases: ["Turkiye", "Turkey", "Republic of Turkey"]
};

export const countryOptions: CountryOption[] = [
  TURKEY_COUNTRY,
  { code: "GB", name: "İngiltere", aliases: ["UK", "United Kingdom", "Britain", "Great Britain", "England"] },
  { code: "US", name: "Amerika Birleşik Devletleri", aliases: ["USA", "United States", "America"] },
  { code: "DE", name: "Almanya", aliases: ["Germany", "Deutschland"] },
  { code: "NL", name: "Hollanda", aliases: ["Netherlands", "The Netherlands"] },
  { code: "RU", name: "Rusya", aliases: ["Russia", "Russian Federation"] },
  { code: "UA", name: "Ukrayna", aliases: ["Ukraine"] },
  { code: "BY", name: "Belarus", aliases: ["Beyaz Rusya"] },
  { code: "AZ", name: "Azerbaycan", aliases: ["Azerbaijan"] },
  { code: "GE", name: "Gürcistan", aliases: ["Georgia"] },
  { code: "KZ", name: "Kazakistan", aliases: ["Kazakhstan"] },
  { code: "KG", name: "Kırgızistan", aliases: ["Kyrgyzstan"] },
  { code: "UZ", name: "Özbekistan", aliases: ["Uzbekistan"] },
  { code: "TM", name: "Türkmenistan", aliases: ["Turkmenistan"] },
  { code: "AF", name: "Afganistan", aliases: ["Afghanistan"] },
  { code: "AL", name: "Arnavutluk", aliases: ["Albania"] },
  { code: "DZ", name: "Cezayir", aliases: ["Algeria"] },
  { code: "AS", name: "Amerikan Samoası", aliases: ["American Samoa"] },
  { code: "AD", name: "Andorra" },
  { code: "AO", name: "Angola" },
  { code: "AI", name: "Anguilla" },
  { code: "AQ", name: "Antarktika", aliases: ["Antarctica"] },
  { code: "AG", name: "Antigua ve Barbuda", aliases: ["Antigua and Barbuda"] },
  { code: "AR", name: "Arjantin", aliases: ["Argentina"] },
  { code: "AM", name: "Ermenistan", aliases: ["Armenia"] },
  { code: "AW", name: "Aruba" },
  { code: "AU", name: "Avustralya", aliases: ["Australia"] },
  { code: "AT", name: "Avusturya", aliases: ["Austria"] },
  { code: "BS", name: "Bahamalar", aliases: ["Bahamas"] },
  { code: "BH", name: "Bahreyn", aliases: ["Bahrain"] },
  { code: "BD", name: "Bangladeş", aliases: ["Bangladesh"] },
  { code: "BB", name: "Barbados" },
  { code: "BE", name: "Belçika", aliases: ["Belgium"] },
  { code: "BZ", name: "Belize" },
  { code: "BJ", name: "Benin" },
  { code: "BM", name: "Bermuda" },
  { code: "BT", name: "Bhutan" },
  { code: "BO", name: "Bolivya", aliases: ["Bolivia"] },
  { code: "BQ", name: "Bonaire" },
  { code: "BA", name: "Bosna Hersek", aliases: ["Bosnia", "Bosnia and Herzegovina"] },
  { code: "BW", name: "Botsvana", aliases: ["Botswana"] },
  { code: "BR", name: "Brezilya", aliases: ["Brazil"] },
  { code: "IO", name: "Britanya Hint Okyanusu Toprakları", aliases: ["British Indian Ocean Territory"] },
  { code: "VG", name: "Britanya Virjin Adaları", aliases: ["British Virgin Islands"] },
  { code: "BN", name: "Brunei" },
  { code: "BG", name: "Bulgaristan", aliases: ["Bulgaria"] },
  { code: "BF", name: "Burkina Faso" },
  { code: "BI", name: "Burundi" },
  { code: "CV", name: "Yeşil Burun Adaları", aliases: ["Cape Verde", "Cabo Verde"] },
  { code: "KH", name: "Kamboçya", aliases: ["Cambodia"] },
  { code: "CM", name: "Kamerun", aliases: ["Cameroon"] },
  { code: "CA", name: "Kanada", aliases: ["Canada"] },
  { code: "KY", name: "Cayman Adaları", aliases: ["Cayman Islands"] },
  { code: "CF", name: "Orta Afrika Cumhuriyeti", aliases: ["Central African Republic"] },
  { code: "TD", name: "Çad", aliases: ["Chad"] },
  { code: "CL", name: "Şili", aliases: ["Chile"] },
  { code: "CN", name: "Çin", aliases: ["China"] },
  { code: "CX", name: "Christmas Adası", aliases: ["Christmas Island"] },
  { code: "CC", name: "Cocos Adaları", aliases: ["Cocos Islands"] },
  { code: "CO", name: "Kolombiya", aliases: ["Colombia"] },
  { code: "KM", name: "Komorlar", aliases: ["Comoros"] },
  { code: "CG", name: "Kongo Cumhuriyeti", aliases: ["Congo"] },
  { code: "CD", name: "Kongo Demokratik Cumhuriyeti", aliases: ["Democratic Republic of the Congo"] },
  { code: "CK", name: "Cook Adaları", aliases: ["Cook Islands"] },
  { code: "CR", name: "Kosta Rika", aliases: ["Costa Rica"] },
  { code: "CI", name: "Fildişi Sahili", aliases: ["Ivory Coast", "Cote d'Ivoire"] },
  { code: "HR", name: "Hırvatistan", aliases: ["Croatia"] },
  { code: "CU", name: "Küba", aliases: ["Cuba"] },
  { code: "CW", name: "Curaçao", aliases: ["Curacao"] },
  { code: "CY", name: "Kıbrıs", aliases: ["Cyprus"] },
  { code: "CZ", name: "Çekya", aliases: ["Czechia", "Czech Republic"] },
  { code: "DK", name: "Danimarka", aliases: ["Denmark"] },
  { code: "DJ", name: "Cibuti", aliases: ["Djibouti"] },
  { code: "DM", name: "Dominika", aliases: ["Dominica"] },
  { code: "DO", name: "Dominik Cumhuriyeti", aliases: ["Dominican Republic"] },
  { code: "EC", name: "Ekvador", aliases: ["Ecuador"] },
  { code: "EG", name: "Mısır", aliases: ["Egypt"] },
  { code: "SV", name: "El Salvador" },
  { code: "GQ", name: "Ekvator Ginesi", aliases: ["Equatorial Guinea"] },
  { code: "ER", name: "Eritre" },
  { code: "EE", name: "Estonya", aliases: ["Estonia"] },
  { code: "SZ", name: "Esvatini", aliases: ["Eswatini", "Swaziland"] },
  { code: "ET", name: "Etiyopya", aliases: ["Ethiopia"] },
  { code: "FK", name: "Falkland Adaları", aliases: ["Falkland Islands"] },
  { code: "FO", name: "Faroe Adaları", aliases: ["Faroe Islands"] },
  { code: "FJ", name: "Fiji" },
  { code: "FI", name: "Finlandiya", aliases: ["Finland"] },
  { code: "FR", name: "Fransa", aliases: ["France"] },
  { code: "GF", name: "Fransız Guyanası", aliases: ["French Guiana"] },
  { code: "PF", name: "Fransız Polinezyası", aliases: ["French Polynesia"] },
  { code: "GA", name: "Gabon" },
  { code: "GM", name: "Gambiya", aliases: ["Gambia"] },
  { code: "GH", name: "Gana", aliases: ["Ghana"] },
  { code: "GI", name: "Cebelitarık", aliases: ["Gibraltar"] },
  { code: "GR", name: "Yunanistan", aliases: ["Greece"] },
  { code: "GL", name: "Grönland", aliases: ["Greenland"] },
  { code: "GD", name: "Grenada" },
  { code: "GP", name: "Guadeloupe" },
  { code: "GU", name: "Guam" },
  { code: "GT", name: "Guatemala" },
  { code: "GG", name: "Guernsey" },
  { code: "GN", name: "Gine", aliases: ["Guinea"] },
  { code: "GW", name: "Gine-Bissau", aliases: ["Guinea-Bissau"] },
  { code: "GY", name: "Guyana" },
  { code: "HT", name: "Haiti" },
  { code: "HN", name: "Honduras" },
  { code: "HK", name: "Hong Kong" },
  { code: "HU", name: "Macaristan", aliases: ["Hungary"] },
  { code: "IS", name: "İzlanda", aliases: ["Iceland"] },
  { code: "IN", name: "Hindistan", aliases: ["India"] },
  { code: "ID", name: "Endonezya", aliases: ["Indonesia"] },
  { code: "IR", name: "İran", aliases: ["Iran"] },
  { code: "IQ", name: "Irak", aliases: ["Iraq"] },
  { code: "IE", name: "İrlanda", aliases: ["Ireland"] },
  { code: "IM", name: "Man Adası", aliases: ["Isle of Man"] },
  { code: "IL", name: "İsrail", aliases: ["Israel"] },
  { code: "IT", name: "İtalya", aliases: ["Italy"] },
  { code: "JM", name: "Jamaika", aliases: ["Jamaica"] },
  { code: "JP", name: "Japonya", aliases: ["Japan"] },
  { code: "JE", name: "Jersey" },
  { code: "JO", name: "Ürdün", aliases: ["Jordan"] },
  { code: "KE", name: "Kenya" },
  { code: "KI", name: "Kiribati" },
  { code: "KP", name: "Kuzey Kore", aliases: ["North Korea"] },
  { code: "KR", name: "Güney Kore", aliases: ["South Korea", "Korea"] },
  { code: "XK", name: "Kosova", aliases: ["Kosovo"] },
  { code: "KW", name: "Kuveyt", aliases: ["Kuwait"] },
  { code: "LA", name: "Laos" },
  { code: "LV", name: "Letonya", aliases: ["Latvia"] },
  { code: "LB", name: "Lübnan", aliases: ["Lebanon"] },
  { code: "LS", name: "Lesotho" },
  { code: "LR", name: "Liberya", aliases: ["Liberia"] },
  { code: "LY", name: "Libya" },
  { code: "LI", name: "Lihtenştayn", aliases: ["Liechtenstein"] },
  { code: "LT", name: "Litvanya", aliases: ["Lithuania"] },
  { code: "LU", name: "Lüksemburg", aliases: ["Luxembourg"] },
  { code: "MO", name: "Makao", aliases: ["Macau"] },
  { code: "MG", name: "Madagaskar", aliases: ["Madagascar"] },
  { code: "MW", name: "Malavi", aliases: ["Malawi"] },
  { code: "MY", name: "Malezya", aliases: ["Malaysia"] },
  { code: "MV", name: "Maldivler", aliases: ["Maldives"] },
  { code: "ML", name: "Mali" },
  { code: "MT", name: "Malta" },
  { code: "MH", name: "Marshall Adaları", aliases: ["Marshall Islands"] },
  { code: "MQ", name: "Martinik", aliases: ["Martinique"] },
  { code: "MR", name: "Moritanya", aliases: ["Mauritania"] },
  { code: "MU", name: "Mauritius" },
  { code: "YT", name: "Mayotte" },
  { code: "MX", name: "Meksika", aliases: ["Mexico"] },
  { code: "FM", name: "Mikronezya", aliases: ["Micronesia"] },
  { code: "MD", name: "Moldova" },
  { code: "MC", name: "Monako", aliases: ["Monaco"] },
  { code: "MN", name: "Moğolistan", aliases: ["Mongolia"] },
  { code: "ME", name: "Karadağ", aliases: ["Montenegro"] },
  { code: "MS", name: "Montserrat" },
  { code: "MA", name: "Fas", aliases: ["Morocco"] },
  { code: "MZ", name: "Mozambik", aliases: ["Mozambique"] },
  { code: "MM", name: "Myanmar", aliases: ["Burma"] },
  { code: "NA", name: "Namibya", aliases: ["Namibia"] },
  { code: "NR", name: "Nauru" },
  { code: "NP", name: "Nepal" },
  { code: "NC", name: "Yeni Kaledonya", aliases: ["New Caledonia"] },
  { code: "NZ", name: "Yeni Zelanda", aliases: ["New Zealand"] },
  { code: "NI", name: "Nikaragua", aliases: ["Nicaragua"] },
  { code: "NE", name: "Nijer", aliases: ["Niger"] },
  { code: "NG", name: "Nijerya", aliases: ["Nigeria"] },
  { code: "NU", name: "Niue" },
  { code: "NF", name: "Norfolk Adası", aliases: ["Norfolk Island"] },
  { code: "MK", name: "Kuzey Makedonya", aliases: ["North Macedonia", "Macedonia"] },
  { code: "MP", name: "Kuzey Mariana Adaları", aliases: ["Northern Mariana Islands"] },
  { code: "NO", name: "Norveç", aliases: ["Norway"] },
  { code: "OM", name: "Umman", aliases: ["Oman"] },
  { code: "PK", name: "Pakistan" },
  { code: "PW", name: "Palau" },
  { code: "PS", name: "Filistin", aliases: ["Palestine"] },
  { code: "PA", name: "Panama" },
  { code: "PG", name: "Papua Yeni Gine", aliases: ["Papua New Guinea"] },
  { code: "PY", name: "Paraguay" },
  { code: "PE", name: "Peru" },
  { code: "PH", name: "Filipinler", aliases: ["Philippines"] },
  { code: "PL", name: "Polonya", aliases: ["Poland"] },
  { code: "PT", name: "Portekiz", aliases: ["Portugal"] },
  { code: "PR", name: "Porto Riko", aliases: ["Puerto Rico"] },
  { code: "QA", name: "Katar", aliases: ["Qatar"] },
  { code: "RE", name: "Réunion", aliases: ["Reunion"] },
  { code: "RO", name: "Romanya", aliases: ["Romania"] },
  { code: "RW", name: "Ruanda", aliases: ["Rwanda"] },
  { code: "BL", name: "Saint Barthélemy" },
  { code: "SH", name: "Saint Helena" },
  { code: "KN", name: "Saint Kitts ve Nevis", aliases: ["Saint Kitts and Nevis"] },
  { code: "LC", name: "Saint Lucia" },
  { code: "MF", name: "Saint Martin" },
  { code: "PM", name: "Saint Pierre ve Miquelon", aliases: ["Saint Pierre and Miquelon"] },
  { code: "VC", name: "Saint Vincent ve Grenadinler", aliases: ["Saint Vincent and the Grenadines"] },
  { code: "WS", name: "Samoa" },
  { code: "SM", name: "San Marino" },
  { code: "ST", name: "Sao Tome ve Principe" },
  { code: "SA", name: "Suudi Arabistan", aliases: ["Saudi Arabia"] },
  { code: "SN", name: "Senegal" },
  { code: "RS", name: "Sırbistan", aliases: ["Serbia"] },
  { code: "SC", name: "Seyşeller", aliases: ["Seychelles"] },
  { code: "SL", name: "Sierra Leone" },
  { code: "SG", name: "Singapur", aliases: ["Singapore"] },
  { code: "SX", name: "Sint Maarten" },
  { code: "SK", name: "Slovakya", aliases: ["Slovakia"] },
  { code: "SI", name: "Slovenya", aliases: ["Slovenia"] },
  { code: "SB", name: "Solomon Adaları", aliases: ["Solomon Islands"] },
  { code: "SO", name: "Somali", aliases: ["Somalia"] },
  { code: "ZA", name: "Güney Afrika", aliases: ["South Africa"] },
  { code: "SS", name: "Güney Sudan", aliases: ["South Sudan"] },
  { code: "ES", name: "İspanya", aliases: ["Spain"] },
  { code: "LK", name: "Sri Lanka" },
  { code: "SD", name: "Sudan" },
  { code: "SR", name: "Surinam", aliases: ["Suriname"] },
  { code: "SE", name: "İsveç", aliases: ["Sweden"] },
  { code: "CH", name: "İsviçre", aliases: ["Switzerland"] },
  { code: "SY", name: "Suriye", aliases: ["Syria"] },
  { code: "TW", name: "Tayvan", aliases: ["Taiwan"] },
  { code: "TJ", name: "Tacikistan", aliases: ["Tajikistan"] },
  { code: "TZ", name: "Tanzanya", aliases: ["Tanzania"] },
  { code: "TH", name: "Tayland", aliases: ["Thailand"] },
  { code: "TL", name: "Doğu Timor", aliases: ["Timor-Leste", "East Timor"] },
  { code: "TG", name: "Togo" },
  { code: "TK", name: "Tokelau" },
  { code: "TO", name: "Tonga" },
  { code: "TT", name: "Trinidad ve Tobago", aliases: ["Trinidad and Tobago"] },
  { code: "TN", name: "Tunus", aliases: ["Tunisia"] },
  { code: "TC", name: "Turks ve Caicos Adaları", aliases: ["Turks and Caicos Islands"] },
  { code: "TV", name: "Tuvalu" },
  { code: "VI", name: "ABD Virjin Adaları", aliases: ["U.S. Virgin Islands"] },
  { code: "UG", name: "Uganda" },
  { code: "AE", name: "Birleşik Arap Emirlikleri", aliases: ["UAE", "United Arab Emirates"] },
  { code: "UY", name: "Uruguay" },
  { code: "VU", name: "Vanuatu" },
  { code: "VA", name: "Vatikan", aliases: ["Vatican", "Holy See"] },
  { code: "VE", name: "Venezuela" },
  { code: "VN", name: "Vietnam" },
  { code: "WF", name: "Wallis ve Futuna", aliases: ["Wallis and Futuna"] },
  { code: "EH", name: "Batı Sahra", aliases: ["Western Sahara"] },
  { code: "YE", name: "Yemen" },
  { code: "ZM", name: "Zambiya", aliases: ["Zambia"] },
  { code: "ZW", name: "Zimbabve", aliases: ["Zimbabwe"] }
];

const indexedCountries = countryOptions.map((country, index) => ({
  country,
  index,
  terms: [country.code, country.name, ...(country.aliases ?? [])].map(normalizeCountryText)
}));

export function normalizeCountryText(value: string) {
  return value
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function findCountryByCode(code: string) {
  const normalizedCode = code.trim().toLocaleUpperCase("tr-TR");
  return countryOptions.find((country) => country.code === normalizedCode) ?? null;
}

export function findCountryByNameOrCode(value: string) {
  const query = normalizeCountryText(value);
  if (!query) {
    return null;
  }
  const exact = indexedCountries.find(({ country, terms }) => country.code.toLocaleLowerCase("tr-TR") === query || terms.includes(query));
  return exact?.country ?? null;
}

export function resolveCountry(code: string, name: string) {
  return findCountryByCode(code) ?? findCountryByNameOrCode(name) ?? null;
}

export function searchCountries(query: string, limit = 16) {
  const normalizedQuery = normalizeCountryText(query);
  if (!normalizedQuery) {
    return countryOptions.slice(0, limit);
  }
  return indexedCountries
    .map(({ country, index, terms }) => {
      const exactCode = country.code.toLocaleLowerCase("tr-TR") === normalizedQuery;
      const startsWith = terms.some((term) => term.startsWith(normalizedQuery));
      const includes = terms.some((term) => term.includes(normalizedQuery));
      const score = exactCode ? 0 : startsWith ? 1 : includes ? 2 : 99;
      return { country, index, score };
    })
    .filter((item) => item.score < 99)
    .sort((left, right) => left.score - right.score || left.index - right.index)
    .slice(0, limit)
    .map((item) => item.country);
}
