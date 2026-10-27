"use client";
import { Tooltip } from "@drishya/ui/components/tooltip";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import {
  Library,
  LogOut,
  Menu,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Video,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { chats } from "@/lib/explanations";
import { projectError } from "@/lib/projects";
import "./studio.css";
export function StudioMark() {
  return (
    <span className="studio-mark" aria-hidden="true">
      <span>d</span>
    </span>
  );
}
export function StudioShell({
  userId,
  activeChatId,
  library = false,
  title,
  children,
}: {
  userId: string;
  activeChatId?: string;
  library?: boolean;
  title?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(
      localStorage.getItem(`drishya:sidebar:${userId}`) === "closed",
    );
  }, [userId]);
  const toggleSidebar = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(`drishya:sidebar:${userId}`, next ? "closed" : "open");
  };
  const router = useRouter(),
    client = useQueryClient(),
    pathname = usePathname();
  const list = useInfiniteQuery({
    queryKey: ["chats", userId, search],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => chats(pageParam, search),
    getNextPageParam: (last, pages) =>
      last.hasMore ? pages.length * 50 : undefined,
    refetchInterval: 10_000,
  });
  const session = authClient.useSession();
  const [error, setError] = useState("");
  return (
    <div className={`v2-studio ${collapsed ? "sidebar-collapsed" : ""}`}>
      <a className="v2-skip" href="#studio-content">
        Skip to content
      </a>
      {open && (
        <button
          type="button"
          className="v2-drawer-shade"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        />
      )}
      <aside className={`v2-sidebar ${open ? "is-open" : ""}`}>
        <div className="v2-sidebar-brand">
          <Link href="/workspace" onClick={() => setOpen(false)}>
            <StudioMark />
            <span>DRISHYA</span>
          </Link>
          <Tooltip content="Collapse sidebar">
            <button
              type="button"
              className="v2-icon-button v2-sidebar-close"
              aria-label="Close sidebar"
              onClick={() => {
                setOpen(false);
                if (window.matchMedia("(min-width: 761px)").matches)
                  toggleSidebar();
              }}
            >
              <PanelLeftClose size={17} />
            </button>
          </Tooltip>
        </div>
        <Link
          className="v2-new-chat"
          href="/workspace"
          onClick={() => setOpen(false)}
        >
          <Plus size={17} />
          New chat
        </Link>
        <nav className="v2-main-nav">
          <Link
            className={library ? "is-active" : ""}
            href="/workspace/library"
            onClick={() => setOpen(false)}
          >
            <Library size={18} />
            Library
          </Link>
        </nav>
        <div className="v2-sidebar-heading">
          <span>Your chats</span>
          <Search size={14} />
        </div>
        <input
          className="v2-chat-search"
          placeholder="Find a chat"
          aria-label="Find a chat"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <nav className="v2-chat-list" aria-label="Saved chats">
          {list.isPending && (
            <span className="v2-sidebar-note">Loading your chats…</span>
          )}
          {list.isError && (
            <button
              type="button"
              className="v2-sidebar-note"
              onClick={() => {
                void list.refetch();
              }}
            >
              Couldn’t load chats. Retry
            </button>
          )}
          {list.data?.pages
            .flatMap((page) => page.conversations)
            .map((item) => (
              <Tooltip key={item.id} content={item.title}>
                <Link
                  key={item.id}
                  className={activeChatId === item.id ? "is-active" : ""}
                  href={`/workspace/chat/${item.id}`}
                  onClick={() => setOpen(false)}
                >
                  <MessageSquare size={14} />
                  <span>{item.title}</span>
                </Link>
              </Tooltip>
            ))}
          {list.data &&
            !list.data.pages.some((page) => page.conversations.length) && (
              <span className="v2-sidebar-note">
                Your explanations will live here.
              </span>
            )}
          {list.hasNextPage && (
            <button
              type="button"
              className="v2-sidebar-note"
              disabled={list.isFetchingNextPage}
              onClick={() => {
                void list.fetchNextPage();
              }}
            >
              {list.isFetchingNextPage ? "Loading…" : "Load earlier chats"}
            </button>
          )}
        </nav>
        <div className="v2-sidebar-bottom">
          <div className="v2-local-label">
            <span />
            Local generation
          </div>
          <div className="v2-account">
            <Link href="/account">
              <span className="v2-avatar">
                {session.data?.user.name?.[0]?.toUpperCase() ?? "D"}
              </span>
              <span>
                {session.data?.user.name ?? "Your account"}
                <small>Personal workspace</small>
              </span>
            </Link>
            <button
              type="button"
              className="v2-icon-button"
              aria-label="Sign out"
              onClick={() => {
                void authClient
                  .signOut()
                  .then((result) => {
                    if (result.error) throw new Error(result.error.message);
                    client.clear();
                    router.replace("/sign-in");
                    router.refresh();
                  })
                  .catch((reason) => setError(projectError(reason)));
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
          {error && (
            <p role="alert" className="v2-error">
              {error}
            </p>
          )}
        </div>
      </aside>
      <div className="v2-main">
        <header className="v2-header">
          <Tooltip content={collapsed ? "Show sidebar" : "Open navigation"}>
            <button
              type="button"
              className={`v2-icon-button v2-sidebar-open ${collapsed ? "is-visible" : ""}`}
              aria-label="Open sidebar"
              onClick={() => {
                if (window.matchMedia("(min-width: 761px)").matches)
                  toggleSidebar();
                else setOpen(true);
              }}
            >
              {collapsed ? <PanelLeftOpen size={20} /> : <Menu size={20} />}
            </button>
          </Tooltip>
          <span>{title ?? (library ? "Library" : "New explanation")}</span>
          <div className="v2-header-right">
            <span className="v2-header-note">
              <Video size={14} />
              Your ideas, in motion
            </span>
          </div>
        </header>
        <main id="studio-content" className="v2-content" key={pathname}>
          {children}
        </main>
      </div>
    </div>
  );
}
