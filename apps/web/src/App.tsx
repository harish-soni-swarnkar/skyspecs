import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getUserId, setUserId } from "./api/session.js";
import { UserSwitcher } from "./components/UserSwitcher.js";
import { CollectionDetail } from "./views/CollectionDetail.js";
import { CollectionsList } from "./views/CollectionsList.js";

// list vs one collection. No router; spec said the URL can stay put.
type View = { name: "list" } | { name: "collection"; id: string };

export function App() {
  const [view, setView] = useState<View>({ name: "list" });
  const [userId, setCurrentUser] = useState(getUserId());
  const queryClient = useQueryClient();

  const switchUser = (id: string) => {
    if (id === userId) return;
    setUserId(id); // the API client reads this on every request
    setCurrentUser(id);
    queryClient.clear(); // drop the previous user's cached data
    setView({ name: "list" });
  };

  return (
    <div className="app">
      <header className="app-header">
        <button type="button" className="brand" onClick={() => setView({ name: "list" })}>
          🎬 skyspecs
        </button>
        <span className="tagline">movie collection curator</span>
        <div className="header-spacer" />
        <UserSwitcher currentUserId={userId} onSwitch={switchUser} />
      </header>
      <main className="app-main">
        {view.name === "list" ? (
          <CollectionsList onOpen={(id) => setView({ name: "collection", id })} />
        ) : (
          <CollectionDetail id={view.id} onBack={() => setView({ name: "list" })} />
        )}
      </main>
    </div>
  );
}
