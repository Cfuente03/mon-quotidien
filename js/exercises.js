// Base d'exercices : free-exercise-db (domaine public, github.com/yuhonas/free-exercise-db)
import { state, save, uid } from './store.js';

export const IMG_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';

export const MUSCLES_FR = {
  chest: 'Pectoraux', shoulders: 'Épaules', biceps: 'Biceps', triceps: 'Triceps',
  forearms: 'Avant-bras', abdominals: 'Abdominaux', lats: 'Grand dorsal',
  'middle back': 'Milieu du dos', 'lower back': 'Lombaires', traps: 'Trapèzes',
  glutes: 'Fessiers', quadriceps: 'Quadriceps', hamstrings: 'Ischio-jambiers',
  calves: 'Mollets', adductors: 'Adducteurs', abductors: 'Abducteurs', neck: 'Cou',
};

export const EQUIP_FR = {
  barbell: 'Barre', dumbbell: 'Haltères', other: 'Autre', 'body only': 'Poids du corps',
  cable: 'Poulie', machine: 'Machine', kettlebells: 'Kettlebell', bands: 'Élastiques',
  'medicine ball': 'Médecine-ball', 'exercise ball': 'Swiss ball', 'foam roll': 'Rouleau',
  'e-z curl bar': 'Barre EZ', none: 'Aucun',
};

export const CAT_FR = {
  strength: 'Musculation', stretching: 'Étirement', plyometrics: 'Pliométrie',
  powerlifting: 'Force athlétique', 'olympic weightlifting': 'Haltérophilie',
  strongman: 'Strongman', cardio: 'Cardio',
};

// Noms français des exercices les plus courants (les autres restent en anglais)
const NAMES_FR = {
  'Barbell_Bench_Press_-_Medium_Grip': 'Développé couché barre',
  'Dumbbell_Bench_Press': 'Développé couché haltères',
  'Barbell_Incline_Bench_Press_-_Medium_Grip': 'Développé incliné barre',
  'Incline_Dumbbell_Press': 'Développé incliné haltères',
  'Decline_Barbell_Bench_Press': 'Développé décliné barre',
  'Close-Grip_Barbell_Bench_Press': 'Développé couché prise serrée',
  'Machine_Bench_Press': 'Développé couché machine',
  'Dumbbell_Flyes': 'Écarté couché haltères',
  'Incline_Dumbbell_Flyes': 'Écarté incliné haltères',
  'Cable_Crossover': 'Écarté à la poulie (vis-à-vis)',
  'Butterfly': 'Butterfly (pec deck)',
  'Pushups': 'Pompes',
  'Push-Up_Wide': 'Pompes prise large',
  'Push-Ups_-_Close_Triceps_Position': 'Pompes prise serrée',
  'Dips_-_Chest_Version': 'Dips (pectoraux)',
  'Dips_-_Triceps_Version': 'Dips (triceps)',
  'Bench_Dips': 'Dips sur banc',
  'Barbell_Squat': 'Squat barre',
  'Barbell_Full_Squat': 'Squat complet barre',
  'Front_Barbell_Squat': 'Squat avant (front squat)',
  'Goblet_Squat': 'Goblet squat',
  'Bodyweight_Squat': 'Squat poids du corps',
  'Hack_Squat': 'Hack squat',
  'Leg_Press': 'Presse à cuisses',
  'Leg_Extensions': 'Leg extension',
  'Lying_Leg_Curls': 'Leg curl allongé',
  'Seated_Leg_Curl': 'Leg curl assis',
  'Barbell_Lunge': 'Fentes barre',
  'Dumbbell_Lunges': 'Fentes haltères',
  'Barbell_Walking_Lunge': 'Fentes marchées barre',
  'Split_Squat_with_Dumbbells': 'Squat bulgare / split squat haltères',
  'Barbell_Deadlift': 'Soulevé de terre',
  'Sumo_Deadlift': 'Soulevé de terre sumo',
  'Romanian_Deadlift': 'Soulevé de terre roumain',
  'Stiff-Legged_Barbell_Deadlift': 'Soulevé de terre jambes tendues',
  'Trap_Bar_Deadlift': 'Soulevé de terre trap bar',
  'Barbell_Hip_Thrust': 'Hip thrust barre',
  'Barbell_Glute_Bridge': 'Pont fessier barre',
  'Glute_Kickback': 'Kickback fessier',
  'Standing_Calf_Raises': 'Mollets debout',
  'Seated_Calf_Raise': 'Mollets assis',
  'Pullups': 'Tractions',
  'Chin-Up': 'Tractions supination',
  'Wide-Grip_Lat_Pulldown': 'Tirage vertical prise large',
  'Close-Grip_Front_Lat_Pulldown': 'Tirage vertical prise serrée',
  'Seated_Cable_Rows': 'Tirage horizontal poulie',
  'Bent_Over_Barbell_Row': 'Rowing barre',
  'One-Arm_Dumbbell_Row': 'Rowing haltère un bras',
  'T-Bar_Row_with_Handle': 'Rowing T-bar',
  'Inverted_Row': 'Rowing inversé',
  'Straight-Arm_Pulldown': 'Pull-over à la poulie',
  'Face_Pull': 'Face pull',
  'Barbell_Shrug': 'Shrug barre',
  'Dumbbell_Shrug': 'Shrug haltères',
  'Standing_Military_Press': 'Développé militaire debout',
  'Barbell_Shoulder_Press': 'Développé épaules barre',
  'Dumbbell_Shoulder_Press': 'Développé épaules haltères',
  'Arnold_Dumbbell_Press': 'Développé Arnold',
  'Machine_Shoulder_Military_Press': 'Développé épaules machine',
  'Side_Lateral_Raise': 'Élévations latérales',
  'Front_Incline_Dumbbell_Raise': 'Élévations frontales',
  'Reverse_Flyes': 'Oiseau (deltoïdes arrière)',
  'Upright_Barbell_Row': 'Rowing menton',
  'Barbell_Curl': 'Curl barre',
  'EZ-Bar_Curl': 'Curl barre EZ',
  'Dumbbell_Bicep_Curl': 'Curl haltères',
  'Dumbbell_Alternate_Bicep_Curl': 'Curl alterné haltères',
  'Hammer_Curls': 'Curl marteau',
  'Preacher_Curl': 'Curl pupitre',
  'Concentration_Curls': 'Curl concentré',
  'Incline_Dumbbell_Curl': 'Curl incliné',
  'Triceps_Pushdown': 'Extension triceps poulie',
  'Triceps_Pushdown_-_Rope_Attachment': 'Extension triceps corde',
  'EZ-Bar_Skullcrusher': 'Barre au front',
  'Lying_Triceps_Press': 'Extension triceps allongé',
  'Plank': 'Gainage (planche)',
  'Crunches': 'Crunch',
  'Hanging_Leg_Raise': 'Relevé de jambes suspendu',
  'Leg_Lift': 'Relevé de jambes',
  'Russian_Twist': 'Russian twist',
  'Ab_Roller': 'Roue abdominale',
  'Cable_Crunch': 'Crunch à la poulie',
  'Mountain_Climbers': 'Mountain climbers',
  'One-Arm_Kettlebell_Swings': 'Kettlebell swing',
  'Running_Treadmill': 'Course sur tapis',
  'Jogging_Treadmill': 'Jogging sur tapis',
  'Walking_Treadmill': 'Marche sur tapis',
  'Bicycling_Stationary': 'Vélo d\'appartement',
  'Bicycling': 'Vélo',
  'Rowing_Stationary': 'Rameur',
  'Elliptical_Trainer': 'Vélo elliptique',
  'Stairmaster': 'Stepper / escaliers',
  'Rope_Jumping': 'Corde à sauter',
};
export const POPULAR = Object.keys(NAMES_FR);

let db = [];
let byId = new Map();

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export async function loadExercises() {
  if (db.length) return db;
  const res = await fetch('./data/exercises.json');
  const raw = await res.json();
  db = raw.map((e) => ({
    ...e,
    nameFr: NAMES_FR[e.id] || null,
    label: NAMES_FR[e.id] || e.name,
    images: e.images.map((p) => IMG_BASE + p),
  }));
  for (const c of state.customExercises) db.push({ ...c, label: c.name, custom: true });
  db.forEach((e) => { e._search = norm(`${e.label} ${e.name} ${(e.primaryMuscles || []).map((m) => MUSCLES_FR[m] || m).join(' ')}`); });
  byId = new Map(db.map((e) => [e.id, e]));
  return db;
}

export const getEx = (id) => byId.get(id) || { id, label: id, name: id, primaryMuscles: [], secondaryMuscles: [], images: [], category: 'strength' };
export const allExercises = () => db;

export function searchExercises({ q = '', muscle = '', equipment = '', onlyFav = false } = {}) {
  const nq = norm(q.trim());
  let list = db.filter((e) =>
    (!nq || nq.split(/\s+/).every((t) => e._search.includes(t))) &&
    (!muscle || e.primaryMuscles.includes(muscle)) &&
    (!equipment || e.equipment === equipment) &&
    (!onlyFav || state.favorites.includes(e.id)));
  const fav = new Set(state.favorites);
  const used = usageCounts();
  const score = (e) => (fav.has(e.id) ? 1000 : 0) + (used[e.id] || 0) * 10 + (e.nameFr ? 5 : 0) + (e.category === 'strength' ? 1 : 0);
  return list.sort((a, b) => score(b) - score(a) || a.label.localeCompare(b.label));
}

function usageCounts() {
  const c = {};
  for (const w of state.workouts) for (const x of w.exercises) c[x.exId] = (c[x.exId] || 0) + 1;
  return c;
}

export function addCustomExercise({ name, muscle, equipment }) {
  const ex = { id: 'custom_' + uid(), name, primaryMuscles: [muscle], secondaryMuscles: [], equipment, category: 'strength', images: [], instructions: [] };
  state.customExercises.push(ex);
  save();
  const full = { ...ex, label: name, custom: true, _search: norm(`${name} ${MUSCLES_FR[muscle]}`) };
  db.push(full); byId.set(full.id, full);
  return full;
}

// Exercices "chronométrés" / sans charge : on note la durée ou les reps uniquement
export const isCardio = (ex) => ex.category === 'cardio';
