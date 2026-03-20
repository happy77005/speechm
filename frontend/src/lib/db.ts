import Dexie, { Table } from 'dexie';

export interface SavedTranscription {
  id?: number;
  name: string;
  text: string;
  createdAt: Date;
  durationMs?: number;
  wordCount?: number;
  // Structured data for auto-save/JSON export
  original?: string;
  refined_original?: string;
  translate?: string;
  refined_translate?: string;
}

export class TranscriptionDatabase extends Dexie {
  transcriptions!: Table<SavedTranscription>;

  constructor() {
    super('TranscriptionDB');
    this.version(1).stores({
      transcriptions: '++id, name, createdAt'
    });
  }
}

export const db = new TranscriptionDatabase();

export async function saveTranscription(
  text: string,
  customName?: string,
  durationMs?: number,
  structuredData?: Partial<SavedTranscription>
): Promise<number> {
  const count = await db.transcriptions.count();
  const name = customName || `Transcript ${count + 1}`;

  const wordCount = text.trim()
    ? text.trim().split(/\s+/).filter((word) => word.length > 0).length
    : 0;

  const id = await db.transcriptions.add({
    name,
    text,
    createdAt: new Date(),
    durationMs,
    wordCount,
    ...structuredData
  });

  return id;
}

export async function getAllTranscriptions(): Promise<SavedTranscription[]> {
  return await db.transcriptions.orderBy('createdAt').reverse().toArray();
}

export async function getTranscriptionById(id: number): Promise<SavedTranscription | undefined> {
  return await db.transcriptions.get(id);
}

export async function deleteTranscription(id: number): Promise<void> {
  await db.transcriptions.delete(id);
}

export async function updateTranscriptionName(id: number, newName: string): Promise<number> {
  return await db.transcriptions.update(id, { name: newName });
}

export async function updateTranscription(
  id: number,
  data: Partial<SavedTranscription>
): Promise<number> {
  return await db.transcriptions.update(id, data);
}
