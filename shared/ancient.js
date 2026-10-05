// Mapas históricos: regiones de otra época que sustituyen a los países actuales en su propio mapa.
// Sus contornos se generan con `npm run build:historic` recortando la costa real (Natural Earth)
// alrededor de la capital de cada región.
//
// profile: [economía, agricultura, petróleo, industria] como en shared/economy.js.
// island: la región es una isla (o un grupo de islas) y no se reparte la tierra firme.
// Los ids llevan un prefijo por mapa (G_ Grecia, J_ Japón, R_ Roma) para no chocar con los países actuales.

const list = (s) => s.trim().split(/\s+/);

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

// ---------- Imperio romano (117 d. C., Trajano): provincias por su ciudad principal y los pueblos vecinos ----------

const ROME_REGIONS = [
  // Italia y sus islas
  { id: 'R_ROM', name: 'Roma', lon: 12.6, lat: 41.9, terrain: 'plains', profile: [5, 3, 1, 4] },
  { id: 'R_MED', name: 'Mediolanum', lon: 9.19, lat: 45.46, terrain: 'plains', profile: [3, 3, 0, 2] },
  { id: 'R_AQU', name: 'Aquilea', lon: 13.37, lat: 45.9, terrain: 'plains', profile: [3, 2, 0, 2] },
  { id: 'R_RAV', name: 'Rávena', lon: 12.0, lat: 44.4, terrain: 'plains', profile: [2, 3, 0, 1] },
  { id: 'R_CAP', name: 'Capua', lon: 14.25, lat: 41.08, terrain: 'plains', profile: [3, 3, 1, 2] },
  { id: 'R_TAR', name: 'Tarento', lon: 17.1, lat: 40.55, terrain: 'plains', profile: [2, 2, 1, 1] },
  { id: 'R_REG', name: 'Regio', lon: 16.2, lat: 39.0, terrain: 'mountains', profile: [1, 2, 0, 0] },
  { id: 'R_SIR', name: 'Siracusa (Sicilia)', lon: 14.5, lat: 37.4, terrain: 'plains', profile: [3, 4, 0, 1] },
  { id: 'R_CRL', name: 'Caralis (Cerdeña)', lon: 9.0, lat: 40.0, terrain: 'mountains', profile: [1, 3, 0, 1] },
  // Hispania
  { id: 'R_TRC', name: 'Tarraco', lon: 1.1, lat: 41.2, terrain: 'plains', profile: [3, 2, 1, 2] },
  { id: 'R_CSA', name: 'Caesaraugusta', lon: -0.88, lat: 41.65, terrain: 'plains', profile: [2, 2, 0, 1] },
  { id: 'R_TOL', name: 'Toletum', lon: -4.02, lat: 39.86, terrain: 'plains', profile: [1, 2, 0, 1] },
  { id: 'R_CNV', name: 'Cartago Nova', lon: -1.0, lat: 37.65, terrain: 'plains', profile: [2, 1, 0, 3] },
  { id: 'R_COR', name: 'Corduba', lon: -4.78, lat: 37.88, terrain: 'plains', profile: [3, 3, 2, 1] },
  { id: 'R_HIS', name: 'Hispalis', lon: -5.99, lat: 37.39, terrain: 'plains', profile: [3, 3, 3, 1] },
  { id: 'R_EME', name: 'Emerita Augusta', lon: -6.34, lat: 38.92, terrain: 'plains', profile: [2, 2, 1, 1] },
  { id: 'R_OLI', name: 'Olisipo', lon: -8.9, lat: 38.8, terrain: 'plains', profile: [2, 2, 1, 1] },
  { id: 'R_BRA', name: 'Bracara Augusta', lon: -8.42, lat: 41.55, terrain: 'mountains', profile: [1, 2, 0, 1] },
  { id: 'R_AST', name: 'Asturica Augusta', lon: -6.05, lat: 42.46, terrain: 'mountains', profile: [1, 1, 0, 3] },
  // Galia y las Germanias romanas
  { id: 'R_NAR', name: 'Narbo', lon: 3.0, lat: 43.18, terrain: 'plains', profile: [2, 2, 1, 1] },
  { id: 'R_MAS', name: 'Massilia', lon: 5.45, lat: 43.4, terrain: 'plains', profile: [3, 1, 1, 1] },
  { id: 'R_LUG', name: 'Lugdunum', lon: 4.83, lat: 45.76, terrain: 'plains', profile: [4, 2, 0, 2] },
  { id: 'R_BUR', name: 'Burdigala', lon: -0.58, lat: 44.84, terrain: 'plains', profile: [2, 3, 1, 1] },
  { id: 'R_AVA', name: 'Avárico', lon: 2.4, lat: 47.08, terrain: 'plains', profile: [1, 3, 0, 2] },
  { id: 'R_LUT', name: 'Lutecia', lon: 2.35, lat: 48.86, terrain: 'plains', profile: [2, 3, 0, 1] },
  { id: 'R_CON', name: 'Condate (Armórica)', lon: -1.68, lat: 48.11, terrain: 'plains', profile: [1, 2, 0, 0] },
  { id: 'R_DUR', name: 'Durocortoro', lon: 4.03, lat: 49.25, terrain: 'plains', profile: [2, 3, 0, 1] },
  { id: 'R_TRE', name: 'Augusta Treverorum', lon: 6.64, lat: 49.75, terrain: 'plains', profile: [3, 2, 0, 2] },
  { id: 'R_CCA', name: 'Colonia Agripina', lon: 6.96, lat: 50.94, terrain: 'plains', profile: [3, 2, 0, 2] },
  { id: 'R_MOG', name: 'Mogontiacum', lon: 8.27, lat: 50.0, terrain: 'plains', profile: [2, 2, 0, 2] },
  { id: 'R_VIN', name: 'Augusta Vindelicorum', lon: 10.9, lat: 48.37, terrain: 'mountains', profile: [1, 2, 0, 1] },
  // Britania, Caledonia e Hibernia
  { id: 'R_LON', name: 'Londinium', lon: -0.12, lat: 51.51, terrain: 'plains', profile: [3, 2, 0, 1] },
  { id: 'R_ISC', name: 'Isca', lon: -3.53, lat: 50.72, terrain: 'plains', profile: [1, 1, 0, 2] },
  { id: 'R_DEV', name: 'Deva', lon: -2.89, lat: 53.19, terrain: 'plains', profile: [1, 1, 0, 2] },
  { id: 'R_EBO', name: 'Eboracum', lon: -1.08, lat: 53.96, terrain: 'plains', profile: [2, 2, 0, 1] },
  { id: 'R_CAL', name: 'Caledonios', lon: -4.2, lat: 56.9, terrain: 'mountains', profile: [0, 1, 0, 0] },
  { id: 'R_HIB', name: 'Hibernia', lon: -7.7, lat: 53.3, terrain: 'plains', profile: [1, 2, 0, 0] },
  // Danubio y Balcanes
  { id: 'R_NOR', name: 'Virunum (Nórico)', lon: 14.37, lat: 46.7, terrain: 'mountains', profile: [1, 1, 0, 3] },
  { id: 'R_CRN', name: 'Carnuntum', lon: 16.86, lat: 48.0, terrain: 'plains', profile: [2, 2, 0, 1] },
  { id: 'R_AQN', name: 'Aquincum', lon: 19.04, lat: 47.56, terrain: 'plains', profile: [2, 2, 0, 1] },
  { id: 'R_SIM', name: 'Sirmio', lon: 19.61, lat: 44.97, terrain: 'plains', profile: [2, 3, 0, 1] },
  { id: 'R_SAL', name: 'Salona', lon: 16.6, lat: 43.6, terrain: 'mountains', profile: [2, 1, 1, 1] },
  { id: 'R_NAI', name: 'Naiso', lon: 21.9, lat: 43.32, terrain: 'mountains', profile: [1, 2, 0, 1] },
  { id: 'R_SAR', name: 'Sarmizegetusa (Dacia)', lon: 22.79, lat: 45.52, terrain: 'mountains', profile: [2, 2, 0, 3] },
  { id: 'R_NOV', name: 'Novae', lon: 25.39, lat: 43.5, terrain: 'plains', profile: [1, 3, 0, 1] },
  { id: 'R_TOM', name: 'Tomis', lon: 28.4, lat: 44.2, terrain: 'plains', profile: [1, 2, 0, 0] },
  { id: 'R_FIL', name: 'Filipópolis', lon: 24.75, lat: 42.15, terrain: 'plains', profile: [2, 2, 0, 1] },
  { id: 'R_BIZ', name: 'Bizancio', lon: 28.6, lat: 41.15, terrain: 'plains', profile: [4, 1, 0, 2] },
  { id: 'R_TES', name: 'Tesalónica', lon: 22.94, lat: 40.7, terrain: 'plains', profile: [3, 2, 1, 1] },
  { id: 'R_DYR', name: 'Dirraquio', lon: 19.7, lat: 41.2, terrain: 'mountains', profile: [2, 1, 0, 1] },
  { id: 'R_NIC', name: 'Nicópolis (Epiro)', lon: 20.9, lat: 39.3, terrain: 'mountains', profile: [1, 1, 1, 0] },
  { id: 'R_ATE', name: 'Atenas', lon: 23.73, lat: 38.05, terrain: 'plains', profile: [4, 1, 1, 2] },
  { id: 'R_CRT', name: 'Corinto', lon: 22.4, lat: 37.6, terrain: 'mountains', profile: [3, 2, 1, 1] },
  { id: 'R_GOR', name: 'Gortina (Creta)', lon: 24.9, lat: 35.1, island: true, terrain: 'mountains', profile: [2, 2, 1, 0] },
  // Asia Menor
  { id: 'R_EFE', name: 'Éfeso', lon: 27.6, lat: 37.95, terrain: 'plains', profile: [4, 2, 1, 2] },
  { id: 'R_PER', name: 'Pérgamo', lon: 27.4, lat: 39.2, terrain: 'plains', profile: [3, 2, 1, 1] },
  { id: 'R_NCM', name: 'Nicomedia', lon: 29.92, lat: 40.7, terrain: 'plains', profile: [3, 2, 0, 1] },
  { id: 'R_ANC', name: 'Ancira', lon: 32.86, lat: 39.93, terrain: 'plains', profile: [1, 3, 0, 1] },
  { id: 'R_ICO', name: 'Iconio', lon: 32.5, lat: 37.87, terrain: 'plains', profile: [1, 2, 0, 0] },
  { id: 'R_PRG', name: 'Perge', lon: 30.85, lat: 37.1, terrain: 'mountains', profile: [2, 2, 1, 0] },
  { id: 'R_TAS', name: 'Tarso', lon: 34.9, lat: 37.0, terrain: 'plains', profile: [2, 2, 0, 1] },
  { id: 'R_CES', name: 'Cesarea (Capadocia)', lon: 35.48, lat: 38.72, terrain: 'mountains', profile: [1, 2, 0, 1] },
  { id: 'R_AMA', name: 'Amasia', lon: 35.83, lat: 40.65, terrain: 'mountains', profile: [1, 2, 0, 1] },
  { id: 'R_TRP', name: 'Trapezunte', lon: 39.7, lat: 40.85, terrain: 'mountains', profile: [1, 1, 0, 1] },
  { id: 'R_MEL', name: 'Melitene', lon: 38.3, lat: 38.35, terrain: 'mountains', profile: [1, 1, 0, 1] },
  { id: 'R_SLM', name: 'Salamina (Chipre)', lon: 33.6, lat: 35.1, island: true, terrain: 'plains', profile: [2, 1, 1, 2] },
  // Siria, Judea y Arabia
  { id: 'R_ANT', name: 'Antioquía', lon: 36.3, lat: 36.2, terrain: 'plains', profile: [5, 2, 1, 3] },
  { id: 'R_EDE', name: 'Edesa (Osroene)', lon: 38.79, lat: 37.15, terrain: 'plains', profile: [2, 2, 0, 1] },
  { id: 'R_DAM', name: 'Damasco', lon: 36.3, lat: 33.51, terrain: 'plains', profile: [3, 2, 0, 1] },
  { id: 'R_PAL', name: 'Palmira', lon: 38.27, lat: 34.55, terrain: 'desert', profile: [3, 1, 0, 0] },
  { id: 'R_JER', name: 'Jerusalén', lon: 35.0, lat: 31.77, terrain: 'mountains', profile: [2, 2, 1, 1] },
  { id: 'R_PET', name: 'Petra (Arabia)', lon: 35.44, lat: 30.33, terrain: 'desert', profile: [3, 1, 0, 0] },
  { id: 'R_ARB', name: 'Árabes (Duma)', lon: 39.87, lat: 29.81, terrain: 'desert', profile: [1, 0, 0, 0] },
  // Egipto, Kush y África
  { id: 'R_ALE', name: 'Alejandría', lon: 29.95, lat: 31.1, terrain: 'plains', profile: [5, 3, 0, 2] },
  { id: 'R_MEN', name: 'Menfis', lon: 31.25, lat: 29.85, terrain: 'plains', profile: [3, 5, 0, 1] },
  { id: 'R_TEB', name: 'Tebas (Egipto)', lon: 32.65, lat: 25.7, terrain: 'desert', profile: [2, 3, 0, 1] },
  { id: 'R_MER', name: 'Meroe (Kush)', lon: 33.75, lat: 16.94, terrain: 'desert', profile: [2, 1, 0, 2] },
  { id: 'R_CIR', name: 'Cirene', lon: 21.86, lat: 32.7, terrain: 'plains', profile: [2, 2, 1, 0] },
  { id: 'R_LEP', name: 'Leptis Magna', lon: 14.0, lat: 32.4, terrain: 'desert', profile: [3, 2, 2, 0] },
  { id: 'R_GAR', name: 'Garamantes', lon: 12.8, lat: 26.5, terrain: 'desert', profile: [1, 1, 0, 0] },
  { id: 'R_CAR', name: 'Cartago', lon: 10.1, lat: 36.75, terrain: 'plains', profile: [4, 4, 2, 1] },
  { id: 'R_CIT', name: 'Cirta (Numidia)', lon: 6.61, lat: 36.36, terrain: 'plains', profile: [2, 3, 1, 0] },
  { id: 'R_GET', name: 'Gétulos', lon: 4.0, lat: 33.3, terrain: 'desert', profile: [0, 1, 0, 0] },
  { id: 'R_IOL', name: 'Cesarea (Mauritania)', lon: 2.3, lat: 36.4, terrain: 'plains', profile: [2, 2, 1, 0] },
  { id: 'R_VOL', name: 'Volubilis', lon: -5.55, lat: 34.07, terrain: 'plains', profile: [1, 2, 1, 0] },
  { id: 'R_MAU', name: 'Mauros', lon: -6.5, lat: 31.3, terrain: 'mountains', profile: [0, 1, 0, 0] },
  // Germania libre
  { id: 'R_FRI', name: 'Frisios', lon: 6.0, lat: 53.0, terrain: 'plains', profile: [0, 2, 0, 0] },
  { id: 'R_QUE', name: 'Queruscos', lon: 9.8, lat: 52.3, terrain: 'jungle', profile: [0, 2, 0, 1] },
  { id: 'R_CAT', name: 'Catos', lon: 9.3, lat: 51.0, terrain: 'jungle', profile: [0, 2, 0, 1] },
  { id: 'R_SAJ', name: 'Sajones', lon: 9.6, lat: 53.7, terrain: 'plains', profile: [0, 2, 0, 0] },
  { id: 'R_CIM', name: 'Cimbrios', lon: 9.2, lat: 56.2, terrain: 'plains', profile: [0, 2, 0, 0] },
  { id: 'R_SEM', name: 'Semnones (suevos)', lon: 13.4, lat: 52.5, terrain: 'jungle', profile: [0, 2, 0, 1] },
  { id: 'R_HER', name: 'Hermunduros', lon: 11.3, lat: 50.8, terrain: 'jungle', profile: [0, 2, 0, 1] },
  { id: 'R_MAR', name: 'Marcomanos', lon: 14.4, lat: 50.0, terrain: 'jungle', profile: [1, 2, 0, 1] },
  { id: 'R_CUA', name: 'Cuados', lon: 17.6, lat: 48.9, terrain: 'mountains', profile: [0, 2, 0, 1] },
  { id: 'R_RUG', name: 'Rugios', lon: 15.5, lat: 53.8, terrain: 'plains', profile: [0, 2, 0, 0] },
  { id: 'R_VAN', name: 'Vándalos', lon: 17.0, lat: 51.0, terrain: 'jungle', profile: [0, 2, 0, 1] },
  { id: 'R_GOT', name: 'Godos', lon: 18.6, lat: 53.6, terrain: 'plains', profile: [0, 2, 0, 0] },
  // Pueblos del este: estios, vénedos, dacios libres y sármatas
  { id: 'R_EST', name: 'Estios', lon: 24.5, lat: 54.5, terrain: 'jungle', profile: [1, 1, 0, 0] },
  { id: 'R_VEN', name: 'Vénedos', lon: 29.5, lat: 51.5, terrain: 'jungle', profile: [0, 2, 0, 0] },
  { id: 'R_CRP', name: 'Carpos (dacios libres)', lon: 26.3, lat: 47.2, terrain: 'mountains', profile: [0, 2, 0, 1] },
  { id: 'R_BAS', name: 'Bastarnos', lon: 28.5, lat: 47.3, terrain: 'plains', profile: [0, 2, 0, 0] },
  { id: 'R_YAZ', name: 'Yázigas', lon: 20.3, lat: 46.6, terrain: 'plains', profile: [0, 2, 0, 0] },
  { id: 'R_ROX', name: 'Roxolanos', lon: 33.0, lat: 47.0, terrain: 'plains', profile: [0, 2, 0, 0] },
  { id: 'R_SAM', name: 'Sármatas', lon: 41.0, lat: 48.5, terrain: 'plains', profile: [0, 2, 0, 0] },
  { id: 'R_ALA', name: 'Alanos', lon: 44.0, lat: 44.3, terrain: 'plains', profile: [0, 2, 1, 0] },
  { id: 'R_BOS', name: 'Reino del Bósforo', lon: 34.6, lat: 45.1, terrain: 'plains', profile: [3, 2, 0, 1] },
  // Cáucaso
  { id: 'R_COL', name: 'Cólquide', lon: 42.2, lat: 42.2, terrain: 'mountains', profile: [1, 1, 0, 0] },
  { id: 'R_IBE', name: 'Iberia (Mtskheta)', lon: 44.72, lat: 41.84, terrain: 'mountains', profile: [1, 1, 0, 1] },
  { id: 'R_ALB', name: 'Albania caucásica', lon: 47.85, lat: 40.98, terrain: 'mountains', profile: [1, 1, 2, 0] },
  { id: 'R_ARM', name: 'Armenia (Artaxata)', lon: 44.55, lat: 39.9, terrain: 'mountains', profile: [2, 2, 0, 1] },
  // Imperio parto, sus reinos vasallos y el Imperio kushán
  { id: 'R_CTE', name: 'Ctesifonte', lon: 44.58, lat: 33.09, terrain: 'plains', profile: [5, 4, 1, 2] },
  { id: 'R_HAT', name: 'Hatra', lon: 42.72, lat: 35.58, terrain: 'desert', profile: [2, 1, 1, 0] },
  { id: 'R_ADI', name: 'Adiabene (Arbela)', lon: 44.0, lat: 36.19, terrain: 'mountains', profile: [2, 2, 1, 0] },
  { id: 'R_MES', name: 'Mesene (Cárax)', lon: 47.0, lat: 30.8, terrain: 'plains', profile: [3, 2, 1, 0] },
  { id: 'R_SUS', name: 'Susa (Elimaida)', lon: 48.25, lat: 32.19, terrain: 'plains', profile: [2, 3, 1, 1] },
  { id: 'R_ECB', name: 'Ecbatana (Media)', lon: 48.52, lat: 34.8, terrain: 'mountains', profile: [3, 2, 0, 1] },
  { id: 'R_ATR', name: 'Atropatene', lon: 46.6, lat: 37.4, terrain: 'mountains', profile: [1, 2, 1, 0] },
  { id: 'R_RAG', name: 'Ragas', lon: 51.43, lat: 35.6, terrain: 'mountains', profile: [2, 2, 1, 1] },
  { id: 'R_HEC', name: 'Hecatómpilos (Partia)', lon: 54.43, lat: 36.4, terrain: 'mountains', profile: [2, 2, 0, 1] },
  { id: 'R_DAH', name: 'Dahas', lon: 57.0, lat: 39.5, terrain: 'desert', profile: [0, 1, 0, 0] },
  { id: 'R_PRS', name: 'Persépolis (Pérside)', lon: 52.89, lat: 29.93, terrain: 'mountains', profile: [3, 2, 1, 1] },
  { id: 'R_CRM', name: 'Carmania', lon: 57.08, lat: 30.28, terrain: 'desert', profile: [1, 1, 1, 1] },
  { id: 'R_GED', name: 'Gedrosia', lon: 60.5, lat: 27.0, terrain: 'desert', profile: [1, 0, 0, 0] },
  { id: 'R_SAC', name: 'Sacastán', lon: 61.0, lat: 30.9, terrain: 'desert', profile: [1, 1, 0, 0] },
  { id: 'R_MRV', name: 'Merv (Margiana)', lon: 61.83, lat: 37.6, terrain: 'desert', profile: [2, 2, 0, 1] },
  { id: 'R_ARI', name: 'Aria', lon: 62.2, lat: 34.35, terrain: 'mountains', profile: [1, 1, 0, 0] },
  { id: 'R_BAC', name: 'Bactra (Imperio kushán)', lon: 66.9, lat: 36.75, terrain: 'mountains', profile: [3, 2, 0, 2] },
];

// ---------- Todos los mapas históricos ----------

// replaced: países actuales que el mapa sustituye por completo (se ocultan en ese mapa).
// Los que solo cubre en parte (China en el mapa samurái) se quedan debajo, apagados.
export const HISTORIC_MAPS = {
  greece: { prefix: 'G_', regions: GREECE_REGIONS, replaced: ['GRC', 'TUR', 'ALB', 'MKD', 'BGR', 'CYP', 'XNC'] },
  sengoku: { prefix: 'J_', regions: SENGOKU_REGIONS, replaced: ['JPN', 'KOR', 'PRK'] },
  rome: {
    prefix: 'R_',
    regions: ROME_REGIONS,
    replaced: list(`
      ITA FRA ESP PRT GBR IRL BEL NLD LUX DEU CHE AUT DNK POL CZE SVK HUN SVN HRV BIH SRB MNE XKX ALB MKD
      GRC BGR ROU MDA UKR BLR LTU TUR CYP XNC GEO ARM AZE SYR LBN ISR PSE JOR IRQ KWT IRN TKM EGY TUN MAR`),
  },
};

export const ANCIENT_REGIONS = Object.values(HISTORIC_MAPS).flatMap((m) => m.regions);
export const historicIds = (era) => HISTORIC_MAPS[era].regions.map((r) => r.id);
export const isAncient = (id) => typeof id === 'string' && /^[A-Z]_/.test(id);
/** Mapas históricos que sustituyen a un país actual (Grecia y Turquía están en la antigua Grecia y en Roma). */
export const replacedBy = (id) => Object.keys(HISTORIC_MAPS).filter((era) => HISTORIC_MAPS[era].replaced.includes(id));
