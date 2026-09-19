import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type { ImportSummary } from '../../../../types/index.js';
import { exercisesKeys } from '../../exercises/exercises.keys.js';
import { workoutsKeys } from '../../workouts/workouts.keys.js';
import { ImportCsvApi } from '../importCsv.api.js';
import { importCsvKeys } from '../importCsv.keys.js';

export const useImportCsvMutation = (): UseMutationResult<ImportSummary, Error, File> => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: importCsvKeys.upload.queryKey,
    mutationFn: async (file) => {
      const { data } = await ImportCsvApi.upload(file);
      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: workoutsKeys.list._def }),
        queryClient.invalidateQueries({ queryKey: exercisesKeys.list.queryKey }),
      ]);
    },
  });
};
