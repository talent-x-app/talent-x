/** Types du jeu de données de seed (apps/api/prisma/talent-x-sample-data.json). */

export type UserRole = 'coach' | 'athlete';
export type ConsentType = 'data_processing' | 'coach_access' | 'marketing';
export type SessionStatus = 'draft' | 'published' | 'archived';
export type AssignmentStatus = 'assigned' | 'in_progress' | 'completed' | 'skipped';
export type LoadUnit = 'kg' | 'lb' | 'percent_1rm' | 'bodyweight';

export interface SampleUser {
  key: string;
  email: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  sport?: string;
  bio?: string;
  photoUrl?: string;
}

export interface SampleConsent {
  user: string;
  type: ConsentType;
  granted: boolean;
  textVersion: string;
}

export interface SampleGroup {
  key: string;
  coach: string;
  name: string;
  description?: string;
  inviteCode: string;
  members: string[];
}

export interface SampleLoad {
  value: number;
  unit: LoadUnit;
}

export interface SampleExercise {
  name: string;
  order: number;
  sets?: number;
  reps?: number;
  durationSeconds?: number;
  restSeconds?: number;
  load?: SampleLoad;
  notes?: string;
}

export interface ExercisesDoc {
  schemaVersion?: number;
  items: SampleExercise[];
}

export interface SampleSession {
  key: string;
  coach: string;
  title: string;
  description?: string;
  scheduledDate?: string;
  status: SessionStatus;
  exercises: ExercisesDoc;
}

export interface SampleAssignment {
  key: string;
  session: string;
  athlete: string;
  status: AssignmentStatus;
  dueDate?: string;
}

export interface SampleSetResult {
  set: number;
  reps?: number;
  load?: SampleLoad;
  durationSeconds?: number;
  completed?: boolean;
}

export interface SampleExerciseResult {
  exerciseName: string;
  order?: number;
  setResults?: SampleSetResult[];
}

export interface ResultsDoc {
  schemaVersion?: number;
  items: SampleExerciseResult[];
}

export interface SamplePerformance {
  /** Clé de l'affectation (la performance est 1:1 avec l'affectation). */
  assignment: string;
  athlete: string;
  rpe?: number;
  notes?: string;
  results: ResultsDoc;
}

export interface SampleComment {
  author: string;
  /** Exactement un des deux : clé de séance OU clé d'affectation (performance). */
  session?: string;
  performance?: string;
  body: string;
}

export interface SampleData {
  users: SampleUser[];
  consents?: SampleConsent[];
  groups?: SampleGroup[];
  sessions?: SampleSession[];
  assignments?: SampleAssignment[];
  performances?: SamplePerformance[];
  comments?: SampleComment[];
}
