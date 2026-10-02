// Regiones de la antigua Grecia (hacia el 450 a. C.): polis, reinos y satrapías persas.
// Sus contornos se generan con `npm run build:greece` recortando la costa real (Natural Earth)
// alrededor de cada ciudad. Solo se juegan en el mapa «Antigua Grecia».
//
// profile: [economía, agricultura, petróleo, industria] como en shared/economy.js.
// island: la región es una isla (o un grupo de islas) y no se reparte la tierra firme.

export const ANCIENT_PREFIX = 'G_';

export const ANCIENT_REGIONS = [
  // Grecia continental
  { id: 'G_ATE', name: 'Atenas', lon: 23.73, lat: 38.05, terrain: 'plains', profile: [4, 1, 1, 3] },
  { id: 'G_ESP', name: 'Esparta', lon: 22.43, lat: 37.07, terrain: 'mountains', profile: [2, 3, 0, 2] },
  { id: 'G_MES', name: 'Mesenia', lon: 21.85, lat: 37.15, terrain: 'plains', profile: [1, 3, 0, 0] },
  { id: 'G_ARG', name: 'Argos', lon: 22.75, lat: 37.6, terrain: 'plains', profile: [2, 2, 0, 1] },
  { id: 'G_COR', name: 'Corinto', lon: 22.88, lat: 37.92, terrain: 'plains', profile: [4, 1, 0, 2] },
  { id: 'G_ELI', name: 'Élide', lon: 21.45, lat: 37.75, terrain: 'plains', profile: [1, 2, 0, 0] },
  { id: 'G_ARC', name: 'Arcadia', lon: 22.15, lat: 37.5, terrain: 'mountains', profile: [1, 2, 0, 0] },
  { id: 'G_ACA', name: 'Acaya', lon: 21.95, lat: 38.15, terrain: 'plains', profile: [1, 1, 0, 1] },
  { id: 'G_TEB', name: 'Tebas', lon: 23.3, lat: 38.35, terrain: 'plains', profile: [3, 2, 0, 2] },
  { id: 'G_DEL', name: 'Delfos', lon: 22.5, lat: 38.55, terrain: 'mountains', profile: [2, 1, 0, 0] },
  { id: 'G_ETO', name: 'Etolia', lon: 21.5, lat: 38.7, terrain: 'mountains', profile: [1, 1, 0, 0] },
  { id: 'G_TES', name: 'Tesalia', lon: 22.3, lat: 39.55, terrain: 'plains', profile: [2, 3, 0, 1] },
  { id: 'G_EPI', name: 'Epiro', lon: 20.85, lat: 39.55, terrain: 'mountains', profile: [1, 1, 0, 1] },
  { id: 'G_MAC', name: 'Macedonia', lon: 22.4, lat: 40.75, terrain: 'plains', profile: [3, 2, 1, 3] },
  { id: 'G_CAL', name: 'Calcídica', lon: 23.5, lat: 40.3, terrain: 'plains', profile: [2, 1, 1, 1] },
  { id: 'G_TRA', name: 'Tracia', lon: 25.3, lat: 41.15, terrain: 'plains', profile: [1, 2, 1, 1] },
  // Islas del Egeo y del Jónico
  { id: 'G_EUB', name: 'Eubea', lon: 23.85, lat: 38.55, island: true, terrain: 'plains', profile: [2, 1, 0, 1] },
  { id: 'G_COC', name: 'Corcira', lon: 19.9, lat: 39.6, island: true, terrain: 'plains', profile: [2, 1, 0, 0] },
  { id: 'G_CRE', name: 'Creta', lon: 24.9, lat: 35.25, island: true, terrain: 'mountains', profile: [2, 2, 0, 1] },
  { id: 'G_CIC', name: 'Cícladas', lon: 25.4, lat: 37.05, island: true, terrain: 'plains', profile: [2, 0, 0, 1] },
  { id: 'G_LES', name: 'Lesbos', lon: 26.3, lat: 39.2, island: true, terrain: 'plains', profile: [2, 1, 0, 0] },
  { id: 'G_SAM', name: 'Quíos y Samos', lon: 26.4, lat: 38.1, island: true, terrain: 'plains', profile: [2, 1, 0, 1] },
  { id: 'G_ROD', name: 'Rodas', lon: 28.0, lat: 36.2, island: true, terrain: 'plains', profile: [3, 1, 0, 1] },
  { id: 'G_CHI', name: 'Chipre', lon: 33.2, lat: 35.1, island: true, terrain: 'plains', profile: [2, 1, 1, 2] },
  // Balcanes
  { id: 'G_ILI', name: 'Iliria', lon: 19.9, lat: 41.0, terrain: 'mountains', profile: [1, 1, 1, 0] },
  { id: 'G_PEO', name: 'Peonia', lon: 21.6, lat: 41.7, terrain: 'mountains', profile: [1, 1, 0, 1] },
  { id: 'G_ODR', name: 'Odrisia', lon: 25.0, lat: 42.4, terrain: 'plains', profile: [2, 2, 0, 1] },
  { id: 'G_MSI', name: 'Mesia', lon: 25.5, lat: 43.4, terrain: 'plains', profile: [1, 3, 0, 0] },
  { id: 'G_BIZ', name: 'Bizancio', lon: 28.5, lat: 41.3, terrain: 'plains', profile: [4, 1, 0, 2] },
  // Asia Menor (satrapías persas)
  { id: 'G_TRO', name: 'Tróade', lon: 26.6, lat: 39.8, terrain: 'plains', profile: [1, 2, 0, 0] },
  { id: 'G_LID', name: 'Lidia', lon: 28.1, lat: 38.6, terrain: 'plains', profile: [4, 2, 0, 2] },
  { id: 'G_JON', name: 'Jonia', lon: 27.3, lat: 37.9, terrain: 'plains', profile: [3, 1, 0, 2] },
  { id: 'G_CAR', name: 'Caria', lon: 28.2, lat: 37.1, terrain: 'mountains', profile: [2, 1, 0, 1] },
  { id: 'G_LIC', name: 'Licia', lon: 29.9, lat: 36.6, terrain: 'mountains', profile: [1, 1, 0, 0] },
  { id: 'G_PIS', name: 'Panfilia', lon: 31.0, lat: 37.2, terrain: 'mountains', profile: [1, 2, 0, 0] },
  { id: 'G_FRI', name: 'Frigia', lon: 31.0, lat: 39.0, terrain: 'plains', profile: [2, 3, 0, 1] },
  { id: 'G_BIT', name: 'Bitinia', lon: 30.3, lat: 40.5, terrain: 'plains', profile: [2, 2, 0, 1] },
  { id: 'G_GAL', name: 'Galacia', lon: 33.0, lat: 39.6, terrain: 'plains', profile: [1, 3, 0, 0] },
  { id: 'G_PAF', name: 'Paflagonia', lon: 33.8, lat: 41.4, terrain: 'mountains', profile: [1, 1, 1, 0] },
  { id: 'G_CIL', name: 'Cilicia', lon: 35.0, lat: 37.0, terrain: 'plains', profile: [2, 2, 1, 1] },
  { id: 'G_CAP', name: 'Capadocia', lon: 35.5, lat: 38.7, terrain: 'mountains', profile: [1, 2, 1, 1] },
  { id: 'G_PON', name: 'Ponto', lon: 37.5, lat: 40.8, terrain: 'mountains', profile: [2, 1, 1, 1] },
  { id: 'G_COM', name: 'Comagene', lon: 39.0, lat: 37.6, terrain: 'desert', profile: [1, 2, 2, 0] },
  { id: 'G_ARM', name: 'Armenia', lon: 41.5, lat: 39.6, terrain: 'mountains', profile: [1, 1, 2, 1] },
];

export const ANCIENT_IDS = ANCIENT_REGIONS.map((r) => r.id);
export const isAncient = (id) => typeof id === 'string' && id.startsWith(ANCIENT_PREFIX);

// Países actuales que el mapa de la antigua Grecia sustituye por completo (se ocultan en ese mapa).
export const REPLACED_BY_ANCIENT = ['GRC', 'TUR', 'ALB', 'MKD', 'BGR', 'CYP', 'XNC'];
