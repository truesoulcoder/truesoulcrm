// src/utils/apiErrorHandler.ts
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function handleApiError(error: unknown): never {
  if (error instanceof ApiError) {
    throw error;
  }
  
  if (error instanceof Error) {
    throw new ApiError(error.message, 500, 'INTERNAL_SERVER_ERROR');
  }
  
  throw new ApiError('An unknown error occurred', 500, 'UNKNOWN_ERROR');
}