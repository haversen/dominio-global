// Mapas históricos: regiones de otra época que sustituyen a los países actuales en su propio mapa.
// Sus contornos se generan con `npm run build:historic` recortando la costa real (Natural Earth)
// alrededor de la capital de cada región.
//
// profile: [economía, agricultura, petróleo, industria] como en shared/economy.js.
// island: la región es una isla (o un grupo de islas) y no se reparte la tierra firme.
// Los ids llevan un prefijo por mapa (G_ Grecia, J_ Japón) para no chocar con los países actuales.

// ---------- Antigua Grecia (hacia el 450 a. C.): polis, reinos y satrapías persas ----------

const GREECE_REGIONS = [
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

// ---------- Japón Sengoku (hacia 1560): clanes samuráis y los reinos vecinos ----------

const SENGOKU_REGIONS = [
  // Hokkaidō y el norte
  { id: 'J_AIN', name: 'Ainu', lon: 142.6, lat: 43.6, terrain: 'frozen', profile: [0, 1, 0, 0] },
  { id: 'J_KAK', name: 'Kakizaki', lon: 140.2, lat: 41.7, terrain: 'mountains', profile: [1, 1, 0, 0] },
  { id: 'J_NAN', name: 'Nanbu', lon: 141.2, lat: 40.2, terrain: 'mountains', profile: [1, 1, 0, 0] },
  { id: 'J_AND', name: 'Andō', lon: 140.1, lat: 39.8, terrain: 'mountains', profile: [1, 2, 0, 0] },
  { id: 'J_MOG', name: 'Mogami', lon: 140.25, lat: 38.4, terrain: 'mountains', profile: [1, 2, 0, 0] },
  { id: 'J_DAT', name: 'Date', lon: 140.6, lat: 38.0, terrain: 'plains', profile: [2, 2, 0, 1] },
  { id: 'J_ASH', name: 'Ashina', lon: 139.9, lat: 37.45, terrain: 'mountains', profile: [1, 2, 0, 0] },
  // Kantō y el este
  { id: 'J_SAT', name: 'Satake', lon: 140.45, lat: 36.45, terrain: 'plains', profile: [1, 2, 0, 1] },
  { id: 'J_HOJ', name: 'Hōjō', lon: 139.4, lat: 35.7, terrain: 'plains', profile: [3, 3, 0, 2] },
  { id: 'J_SAM', name: 'Satomi', lon: 140.1, lat: 35.15, terrain: 'plains', profile: [1, 1, 0, 0] },
  { id: 'J_UES', name: 'Uesugi', lon: 138.7, lat: 37.2, terrain: 'mountains', profile: [2, 3, 0, 1] },
  { id: 'J_TAK', name: 'Takeda', lon: 138.4, lat: 35.95, terrain: 'mountains', profile: [2, 1, 0, 2] },
  { id: 'J_IMA', name: 'Imagawa', lon: 138.3, lat: 35.0, terrain: 'plains', profile: [3, 2, 0, 1] },
  { id: 'J_TOK', name: 'Tokugawa', lon: 137.3, lat: 34.95, terrain: 'plains', profile: [2, 2, 0, 1] },
  // Centro (Chūbu y Kinai)
  { id: 'J_ODA', name: 'Oda', lon: 136.9, lat: 35.15, terrain: 'plains', profile: [4, 2, 0, 3] },
  { id: 'J_SAI', name: 'Saitō', lon: 137.0, lat: 35.75, terrain: 'mountains', profile: [2, 1, 0, 1] },
  { id: 'J_JIN', name: 'Jinbō', lon: 137.2, lat: 36.65, terrain: 'mountains', profile: [1, 2, 0, 0] },
  { id: 'J_IKK', name: 'Ikkō-ikki', lon: 136.6, lat: 36.45, terrain: 'plains', profile: [1, 2, 0, 1] },
  { id: 'J_ASA', name: 'Asakura', lon: 136.2, lat: 35.95, terrain: 'mountains', profile: [2, 1, 0, 1] },
  { id: 'J_AZA', name: 'Azai', lon: 136.25, lat: 35.35, terrain: 'plains', profile: [2, 2, 0, 1] },
  { id: 'J_KIT', name: 'Kitabatake', lon: 136.35, lat: 34.5, terrain: 'mountains', profile: [1, 1, 0, 1] },
  { id: 'J_ASK', name: 'Ashikaga (Kioto)', lon: 135.75, lat: 35.1, terrain: 'plains', profile: [4, 1, 0, 2] },
  { id: 'J_MIY', name: 'Miyoshi', lon: 135.5, lat: 34.65, terrain: 'plains', profile: [4, 2, 0, 3] },
  { id: 'J_KII', name: 'Saika (Kii)', lon: 135.6, lat: 33.95, terrain: 'mountains', profile: [1, 1, 0, 2] },
  // Oeste de Honshū
  { id: 'J_YAM', name: 'Yamana', lon: 134.7, lat: 35.35, terrain: 'mountains', profile: [1, 1, 0, 1] },
  { id: 'J_AKA', name: 'Akamatsu', lon: 134.65, lat: 34.85, terrain: 'plains', profile: [2, 2, 0, 1] },
  { id: 'J_UKI', name: 'Ukita', lon: 133.9, lat: 34.75, terrain: 'plains', profile: [2, 2, 0, 1] },
  { id: 'J_AMA', name: 'Amago', lon: 133.0, lat: 35.3, terrain: 'mountains', profile: [2, 1, 0, 1] },
  { id: 'J_MOR', name: 'Mōri', lon: 132.2, lat: 34.4, terrain: 'plains', profile: [3, 2, 0, 2] },
  // Shikoku
  { id: 'J_KON', name: 'Kōno', lon: 132.8, lat: 33.75, terrain: 'mountains', profile: [1, 1, 0, 0] },
  { id: 'J_CHO', name: 'Chōsokabe', lon: 133.5, lat: 33.5, terrain: 'mountains', profile: [1, 2, 0, 1] },
  { id: 'J_SOG', name: 'Sogō', lon: 134.2, lat: 34.05, terrain: 'plains', profile: [1, 2, 0, 0] },
  // Kyūshū e islas
  { id: 'J_OTO', name: 'Ōtomo', lon: 131.3, lat: 33.3, terrain: 'mountains', profile: [3, 2, 0, 2] },
  { id: 'J_RYU', name: 'Ryūzōji', lon: 130.15, lat: 33.15, terrain: 'plains', profile: [2, 2, 0, 1] },
  { id: 'J_SAG', name: 'Sagara', lon: 130.75, lat: 32.45, terrain: 'mountains', profile: [1, 1, 0, 0] },
  { id: 'J_ITO', name: 'Itō', lon: 131.35, lat: 32.1, terrain: 'mountains', profile: [1, 1, 0, 0] },
  { id: 'J_SHI', name: 'Shimazu', lon: 130.5, lat: 31.55, terrain: 'mountains', profile: [2, 2, 0, 2] },
  { id: 'J_SOO', name: 'Sō (Tsushima)', lon: 129.3, lat: 34.4, island: true, terrain: 'mountains', profile: [2, 0, 0, 0] },
  { id: 'J_RKY', name: 'Reino de Ryūkyū', lon: 127.8, lat: 26.4, island: true, terrain: 'jungle', profile: [3, 1, 0, 0] },
  // Corea: dinastía Joseon
  { id: 'J_JOS', name: 'Joseon (Hanseong)', lon: 127.0, lat: 37.55, terrain: 'plains', profile: [4, 2, 0, 2] },
  { id: 'J_HAM', name: 'Hamgyŏng', lon: 129.3, lat: 41.4, terrain: 'mountains', profile: [1, 1, 0, 1] },
  { id: 'J_PYO', name: 'Pyŏngan', lon: 125.9, lat: 39.7, terrain: 'mountains', profile: [2, 2, 0, 1] },
  { id: 'J_HWA', name: 'Hwanghae', lon: 125.5, lat: 38.35, terrain: 'plains', profile: [1, 3, 0, 0] },
  { id: 'J_GAN', name: 'Gangwon', lon: 128.4, lat: 37.7, terrain: 'mountains', profile: [1, 1, 0, 0] },
  { id: 'J_CHU', name: 'Chungcheong', lon: 127.2, lat: 36.55, terrain: 'plains', profile: [1, 3, 0, 1] },
  { id: 'J_JEO', name: 'Jeolla', lon: 126.9, lat: 35.1, terrain: 'plains', profile: [2, 3, 0, 1] },
  { id: 'J_GYE', name: 'Gyeongsang', lon: 128.7, lat: 35.85, terrain: 'mountains', profile: [2, 2, 0, 2] },
  // China: dinastía Ming, yurchen y mongoles
  { id: 'J_MIN', name: 'Ming (Pekín)', lon: 116.4, lat: 39.9, terrain: 'plains', profile: [5, 3, 1, 4] },
  { id: 'J_LIA', name: 'Liaodong', lon: 123.0, lat: 41.4, terrain: 'plains', profile: [2, 2, 1, 1] },
  { id: 'J_SHA', name: 'Shandong', lon: 117.8, lat: 36.3, terrain: 'plains', profile: [2, 4, 0, 2] },
  { id: 'J_NAJ', name: 'Nankín', lon: 118.8, lat: 32.0, terrain: 'plains', profile: [4, 3, 0, 3] },
  { id: 'J_ZHE', name: 'Zhejiang', lon: 120.2, lat: 29.4, terrain: 'mountains', profile: [3, 2, 0, 2] },
  { id: 'J_FUJ', name: 'Fujian', lon: 118.2, lat: 25.9, terrain: 'mountains', profile: [2, 1, 0, 1] },
  { id: 'J_JUR', name: 'Yurchen', lon: 127.5, lat: 45.5, terrain: 'frozen', profile: [1, 1, 1, 0] },
  { id: 'J_MON', name: 'Mongoles', lon: 118.0, lat: 44.0, terrain: 'desert', profile: [1, 1, 1, 0] },
];

// ---------- Todos los mapas históricos ----------

// replaced: países actuales que el mapa sustituye por completo (se ocultan en ese mapa).
// Los que solo cubre en parte (China en el mapa samurái) se quedan debajo, apagados.
export const HISTORIC_MAPS = {
  greece: { prefix: 'G_', regions: GREECE_REGIONS, replaced: ['GRC', 'TUR', 'ALB', 'MKD', 'BGR', 'CYP', 'XNC'] },
  sengoku: { prefix: 'J_', regions: SENGOKU_REGIONS, replaced: ['JPN', 'KOR', 'PRK'] },
};

export const ANCIENT_REGIONS = Object.values(HISTORIC_MAPS).flatMap((m) => m.regions);
export const historicIds = (era) => HISTORIC_MAPS[era].regions.map((r) => r.id);
export const isAncient = (id) => typeof id === 'string' && /^[A-Z]_/.test(id);
/** Mapa histórico que sustituye a un país actual (o null). */
export const replacedBy = (id) => Object.keys(HISTORIC_MAPS).find((era) => HISTORIC_MAPS[era].replaced.includes(id)) ?? null;
