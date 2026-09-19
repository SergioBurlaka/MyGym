import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { Program } from '../../../../types/index.js';
import { ProgramsApi } from '../programs.api.js';
import { programsKeys } from '../programs.keys.js';

export const useProgramsQuery = (): UseQueryResult<Program[], Error> =>
  useQuery({
    queryKey: programsKeys.list.queryKey,
    queryFn: async () => {
      const { data } = await ProgramsApi.list();
      return data;
    },
  });
