export function successResponse<T>(data: T, status = 200) {
  return Response.json(data, { status })
}

export function errorResponse(message: string, status = 400) {
  return Response.json({ error: message }, { status })
}
