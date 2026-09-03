import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client.js";
import type {
  AnnotationPatch,
  Collection,
  CollectionMovie,
  CollectionStats,
  CollectionWithMovies,
  MovieSearchPage,
  User,
} from "./types.js";

const keys = {
  users: ["users"] as const,
  collections: ["collections"] as const,
  collection: (id: string) => ["collections", id] as const,
  stats: (id: string) => ["collections", id, "stats"] as const,
  search: (query: string) => ["search", query] as const,
};

export function useUsers() {
  return useQuery({ queryKey: keys.users, queryFn: () => api.get<User[]>("/users") });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.post<User>("/users", { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.users }),
  });
}

export function useCollections() {
  return useQuery({ queryKey: keys.collections, queryFn: () => api.get<Collection[]>("/collections") });
}

export function useCollection(id: string) {
  return useQuery({
    queryKey: keys.collection(id),
    queryFn: () => api.get<CollectionWithMovies>(`/collections/${id}`),
  });
}

export function useCollectionStats(id: string) {
  return useQuery({
    queryKey: keys.stats(id),
    queryFn: () => api.get<CollectionStats>(`/collections/${id}/stats`),
  });
}

export function useSearch(query: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: keys.search(trimmed),
    queryFn: () => api.get<MovieSearchPage>(`/search?query=${encodeURIComponent(trimmed)}`),
    enabled: trimmed.length > 0,
    // Search results are external and read-only; a short cache avoids re-hitting on retype.
    staleTime: 60_000,
  });
}

export function useCreateCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.post<Collection>("/collections", { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.collections }),
  });
}

export function useDeleteCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/collections/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.collections }),
  });
}

/** After a write, refetch the collection and its stats. */
function useCollectionMutation<TArgs>(mutationFn: (args: TArgs) => Promise<unknown>, collectionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.collection(collectionId) });
      void qc.invalidateQueries({ queryKey: keys.stats(collectionId) });
      void qc.invalidateQueries({ queryKey: keys.collections });
    },
  });
}

export function useAddMovie(collectionId: string) {
  return useCollectionMutation(
    (tmdbId: number) => api.post<CollectionMovie>(`/collections/${collectionId}/movies`, { tmdbId }),
    collectionId,
  );
}

export function useRemoveMovie(collectionId: string) {
  return useCollectionMutation(
    (tmdbId: number) => api.del(`/collections/${collectionId}/movies/${tmdbId}`),
    collectionId,
  );
}

export function useUpdateAnnotations(collectionId: string) {
  return useCollectionMutation(
    ({ tmdbId, patch }: { tmdbId: number; patch: AnnotationPatch }) =>
      api.patch<CollectionMovie>(`/collections/${collectionId}/movies/${tmdbId}`, patch),
    collectionId,
  );
}
