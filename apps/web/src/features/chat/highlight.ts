// Algorithm phase 6: lift the messages the room is reacting to above the noise. A message is "hot" when enough fans
// liked it and it is clearly net-positive (so a flamed/divisive message isn't highlighted). Pure, from existing
// reaction counts — no new data, computed on the client as reactions stream in.

export const HOT_LIKES = 5
export const HOT_NET = 3

export function isHotMessage(r: { likes?: number | null; dislikes?: number | null }): boolean {
  const likes = r.likes ?? 0
  const dislikes = r.dislikes ?? 0
  return likes >= HOT_LIKES && likes - dislikes >= HOT_NET
}
