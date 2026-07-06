const BUN_API_BASE_URL = process.env.NEXT_PUBLIC_BUN_API_BASE_URL

export async function fetchFromBunService<T>(path: string): Promise<T> {
  if (!BUN_API_BASE_URL) {
    throw new Error("Missing NEXT_PUBLIC_BUN_API_BASE_URL environment variable")
  }

  const response = await fetch(`${BUN_API_BASE_URL}${path}`)

  if (!response.ok) {
    throw new Error(`Bun service request failed: ${response.status}`)
  }

  return response.json() as Promise<T>
}
