import { api } from '../../../api/client.js';
import type { Program } from '../../../types/index.js';
import type { SaveProgramBody } from './programs.types.js';

export const ProgramsApi = {
  async list() {
    return api.get<Program[]>('/programs');
  },
  async getById(id: string) {
    return api.get<Program>(`/programs/${id}`);
  },
  async suggestion() {
    return api.get<Program | null>('/programs/suggestion');
  },
  async create(body: SaveProgramBody) {
    return api.post<Program>('/programs', body);
  },
  async update(id: string, body: SaveProgramBody) {
    return api.put<Program>(`/programs/${id}`, body);
  },
  async remove(id: string) {
    return api.delete(`/programs/${id}`);
  },
};
