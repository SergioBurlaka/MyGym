import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { Exercise } from '../../../../types/index.js';
import { ExercisesApi } from '../exercises.api.js';
import { exercisesKeys } from '../exercises.keys.js';

export const useExercisesQuery = (): UseQueryResult<Exercise[], Error> =>
  useQuery({
    queryKey: exercisesKeys.list.queryKey,
    queryFn: async () => {
      const { data } = await ExercisesApi.list();
      return data;
    },
  });
