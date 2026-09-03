// Wire types come from the shared contract package, so the web app and API can't drift apart.
export type {
  User,
  Collection,
  CollectionMovie,
  CollectionWithMovies,
  CollectionStats,
  AnnotationPatch,
  MovieSearchResult,
  MovieSearchPage,
} from "@skyspecs/contracts";
