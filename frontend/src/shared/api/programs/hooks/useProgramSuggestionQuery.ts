import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { Program } from '../../../../types/index.js';
import { ProgramsApi } from '../programs.api.js';
import { programsKeys } from '../programs.keys.js';

export const useProgramSuggestionQuery = (): UseQueryResult<Program | null, Error> =>
  useQuery({
    queryKey: programsKeys.suggestion.queryKey,
    queryFn: async () => {
      const { data } = await ProgramsApi.suggestion();
      return data;
    },
  });
