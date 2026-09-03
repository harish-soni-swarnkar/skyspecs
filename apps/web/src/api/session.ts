// Who we're acting as, kept in localStorage. No auth — just the client side of the x-user-id
// header. Read on every request.

const KEY = "skyspecs.userId";
export const DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000001";

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? DEFAULT_USER_ID;
  } catch {
    return DEFAULT_USER_ID;
  }
}

let userId = read();

export function getUserId(): string {
  return userId;
}

export function setUserId(id: string): void {
  userId = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // private window / blocked storage — we just don't remember it
  }
}
