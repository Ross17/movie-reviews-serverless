// types for the movie reviews app
// keeping it simple for now

export interface Movie {
  pk: string;
  sk: string;
  title: string;
  date: string;
  overview: string;
}

export interface Reviewer {
  pk: string;
  sk: string;
  email: string;
  name: string;
}

// review is basically the relationship between movie and reviewer
export interface Review {
  pk: string;
  sk: string;
  movieId: number;
  reviewerId: string;
  publishedDate: string;
  text: string;
}

// request body types
export interface AddReviewBody {
  movieId: number;
  text: string;
  date: string;
}

export interface UpdateReviewBody {
  text: string;
}

export interface RegisterBody {
  email: string;
  password: string;
  name: string;
}

export interface LoginBody {
  email: string;
  password: string;
}

export interface ConfirmBody {
  email: string;
  code: string;
}