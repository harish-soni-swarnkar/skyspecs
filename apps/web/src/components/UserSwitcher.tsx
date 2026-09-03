import { useState } from "react";
import { useCreateUser, useUsers } from "../api/hooks.js";

/** Pick a user (sets `x-user-id`). No login. */
export function UserSwitcher({
  currentUserId,
  onSwitch,
}: {
  currentUserId: string;
  onSwitch: (id: string) => void;
}) {
  const users = useUsers();
  const createUser = useCreateUser();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    createUser.mutate(trimmed, {
      onSuccess: (user) => {
        setName("");
        setAdding(false);
        onSwitch(user.id); // land as the user you just created
      },
    });
  };

  return (
    <div className="user-switcher">
      <span className="user-label muted">Viewing as</span>
      <select aria-label="Current user" value={currentUserId} onChange={(e) => onSwitch(e.target.value)}>
        {/* Keep the current id selectable even before the list loads. */}
        {!users.data?.some((u) => u.id === currentUserId) && <option value={currentUserId}>…</option>}
        {users.data?.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>

      {adding ? (
        <form className="user-add" onSubmit={submit}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New user name"
            aria-label="New user name"
          />
          <button type="submit" disabled={!name.trim() || createUser.isPending}>
            Add
          </button>
          <button type="button" className="link" onClick={() => setAdding(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <button type="button" className="link" onClick={() => setAdding(true)}>
          + New user
        </button>
      )}
    </div>
  );
}
