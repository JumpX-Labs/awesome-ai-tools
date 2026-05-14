import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FlatTool, ToolsPayload } from "./types";
import { ALL_CATEGORY_ID } from "./types";
import { textMatchesQuery } from "./utils/matchSearch";
import { useFavorites, type FavStatus } from "./hooks/useFavorites";

const STORAGE_THEME = "jumpx-theme";

type ResolvedTheme = "light" | "dark";
type ThemeMode = "light" | "dark" | "system";

function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === "dark" || mode === "light") return mode;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readStoredTheme(): ThemeMode {
  const v = localStorage.getItem(STORAGE_THEME);
  if (v === "light" || v === "dark" || v === "system") return v;
  return "system";
}

function isTypingField(el: Element | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT" && (el as HTMLInputElement).type !== "button" && (el as HTMLInputElement).type !== "submit") return true;
  if (el.isContentEditable) return true;
  return false;
}

function isSearchField(el: Element | null): boolean {
  return el instanceof HTMLElement && el.dataset.jxSearch === "true";
}

function pad(n: number, width = 3): string {
  return n.toString().padStart(width, "0");
}

const SEARCH_ICON = (
  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden>
    <path
      fillRule="evenodd"
      d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
      clipRule="evenodd"
    />
  </svg>
);

const FAV_LABEL: Record<"none" | FavStatus, string> = {
  none: "MARK",
  using: "USING",
  wish: "WISH",
};

const FAV_NEXT_HINT: Record<"none" | FavStatus, string> = {
  none: "标记为「在用」",
  using: "切换为「想用」",
  wish: "取消标记",
};

function ToolCard({
  tool,
  index,
  showIndex,
  showCategoryMeta,
  favStatus,
  onToggleFav,
}: {
  tool: FlatTool;
  index: number;
  showIndex: boolean;
  showCategoryMeta: boolean;
  favStatus: FavStatus | null;
  onToggleFav: (tool: FlatTool) => void;
}) {
  const statusKey = favStatus ?? "none";
  const onFavClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    onToggleFav(tool);
  };
  return (
    <a className="jx-card" href={tool.url} target="_blank" rel="noopener noreferrer">
      {showIndex && index < 10 ? <span className="jx-index">{pad(index + 1, 2)}</span> : null}
      <button
        type="button"
        className="jx-fav"
        data-status={statusKey}
        onClick={onFavClick}
        title={`${statusKey === "none" ? "未标记" : statusKey === "using" ? "在用" : "想用"} · 点击${FAV_NEXT_HINT[statusKey]}`}
        aria-label={`收藏状态：${FAV_LABEL[statusKey]}（${FAV_NEXT_HINT[statusKey]}）`}
      >
        {FAV_LABEL[statusKey]}
      </button>
      <div className="jx-avatar">{(tool.name.trim().charAt(0) || "?").toUpperCase()}</div>
      <div className="jx-card-body">
        <h3 className="jx-card-title">{tool.name}</h3>
        {showCategoryMeta ? <div className="jx-card-meta">// {tool.category}</div> : null}
        <p className="jx-card-desc">{tool.description}</p>
      </div>
    </a>
  );
}

export default function App() {
  const [payload, setPayload] = useState<ToolsPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [themeMode, setThemeMode] = useState<ThemeMode>(readStoredTheme);
  const [categoryId, setCategoryId] = useState<string>(ALL_CATEGORY_ID);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isStuck, setIsStuck] = useState(false);
  const [catMenuOpen, setCatMenuOpen] = useState(false);
  const [myView, setMyView] = useState(false);
  const { count: favCount, cycle: cycleFav, getStatus: getFavStatus } = useFavorites();

  const heroSearchRef = useRef<HTMLInputElement>(null);
  const stickySearchRef = useRef<HTMLInputElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const catMenuRef = useRef<HTMLDivElement>(null);
  const catTriggerRef = useRef<HTMLButtonElement>(null);
  const filteredRef = useRef<FlatTool[]>([]);

  useEffect(() => {
    document.documentElement.dataset.theme = resolveTheme(themeMode);
    if (themeMode === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const fn = () => {
        document.documentElement.dataset.theme = resolveTheme("system");
      };
      mq.addEventListener("change", fn);
      return () => mq.removeEventListener("change", fn);
    }
  }, [themeMode]);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}tools.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`无法加载 tools.json（${r.status}）。请先执行 npm run parse`);
        return r.json();
      })
      .then((data: ToolsPayload) => {
        setPayload(data);
        setLoadError(null);
        document.title = `${data.siteTitle} · JumpX`;
      })
      .catch((e: unknown) => {
        setLoadError(e instanceof Error ? e.message : String(e));
      });
  }, []);

  const flatTools: FlatTool[] = useMemo(() => {
    if (!payload) return [];
    return payload.categories.flatMap((c) =>
      c.items.map((item) => ({
        ...item,
        category: c.name,
      })),
    );
  }, [payload]);

  const filtered: FlatTool[] = useMemo(() => {
    if (myView) {
      return flatTools.filter((t) => getFavStatus(t.url) !== null);
    }
    const pool =
      categoryId === ALL_CATEGORY_ID
        ? flatTools
        : flatTools.filter((t) => t.category === categoryId);
    const q = searchQuery.trim();
    if (!q) return pool;
    return pool.filter(
      (t) =>
        textMatchesQuery(t.name, q) ||
        textMatchesQuery(t.description, q) ||
        textMatchesQuery(t.url, q) ||
        textMatchesQuery(t.category, q),
    );
  }, [flatTools, categoryId, searchQuery, myView, getFavStatus]);

  useEffect(() => {
    filteredRef.current = filtered;
  }, [filtered]);

  const cycleTheme = useCallback(() => {
    setThemeMode((m) => {
      const next: ThemeMode = m === "light" ? "dark" : m === "dark" ? "system" : "light";
      localStorage.setItem(STORAGE_THEME, next);
      return next;
    });
  }, []);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setIsStuck(!entry.isIntersecting && entry.boundingClientRect.top < 0),
      { threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [payload]);

  useEffect(() => {
    if (!isStuck) setCatMenuOpen(false);
  }, [isStuck]);

  useEffect(() => {
    if (!catMenuOpen) return;
    const onDocClick = (ev: MouseEvent) => {
      const target = ev.target as Node;
      if (catMenuRef.current?.contains(target)) return;
      if (catTriggerRef.current?.contains(target)) return;
      setCatMenuOpen(false);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setCatMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [catMenuOpen]);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "/" && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
        if (!isTypingField(document.activeElement)) {
          ev.preventDefault();
          const target = isStuck ? stickySearchRef.current : heroSearchRef.current;
          target?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isStuck]);

  useEffect(() => {
    const onEnter = (ev: KeyboardEvent) => {
      if (ev.key !== "Enter") return;
      const active = document.activeElement;
      const searchFocused = isSearchField(active);
      const q = searchQuery.trim();
      if (!searchFocused && !q) return;
      if (isTypingField(active) && !searchFocused) return;
      const list = filteredRef.current;
      if (!list.length) return;
      ev.preventDefault();
      window.open(list[0].url, "_blank", "noopener,noreferrer");
    };
    document.addEventListener("keydown", onEnter);
    return () => document.removeEventListener("keydown", onEnter);
  }, [searchQuery]);

  const categoryEntries = useMemo(
    () => payload?.categories.map((c) => ({ name: c.name, count: c.items.length })) ?? [],
    [payload],
  );

  const groupedFiltered = useMemo(() => {
    if (!payload) return null;
    if (!myView && categoryId !== ALL_CATEGORY_ID) return null;
    const byCategory = new Map<string, FlatTool[]>();
    for (const tool of filtered) {
      const list = byCategory.get(tool.category) ?? [];
      list.push(tool);
      byCategory.set(tool.category, list);
    }
    return payload.categories
      .map((c) => ({ name: c.name, items: byCategory.get(c.name) ?? [] }))
      .filter((g) => g.items.length > 0);
  }, [payload, filtered, categoryId, myView]);

  const toggleMyView = useCallback(() => {
    setMyView((v) => {
      const next = !v;
      if (next) {
        setCategoryId(ALL_CATEGORY_ID);
        setSearchInput("");
        setSearchQuery("");
        setCatMenuOpen(false);
      }
      return next;
    });
  }, []);

  const selectCategory = useCallback((id: string) => {
    setCategoryId(id);
    setMyView(false);
  }, []);

  if (loadError) {
    return (
      <div className="jx-shell">
        <div className="jx-inner">
          <div className="jx-error" role="alert">
            <strong>ERR · 数据加载失败</strong>
            <p style={{ margin: "0.5rem 0 0" }}>{loadError}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="jx-shell">
        <div className="jx-inner">
          <p className="jx-empty">LOADING …</p>
        </div>
      </div>
    );
  }

  const showIndex = searchQuery.trim().length > 0;
  const totalCount = flatTools.length;
  const visibleCount = filtered.length;
  const activeCategoryLabel = myView
    ? `MY (${favCount})`
    : categoryId === ALL_CATEGORY_ID
      ? "ALL"
      : categoryId;
  const themeLabel = themeMode === "light" ? "L" : themeMode === "dark" ? "D" : "S";

  const onSearchChange = (v: string) => {
    setSearchInput(v);
    setSearchQuery(v);
  };

  return (
    <div className="jx-shell">
      <div className="jx-stickybar" data-visible={isStuck}>
        <div className="jx-stickybar-inner">
          <span className="jx-logo jx-logo--sm" aria-label="JumpX">
            <span className="jx-logo-dot" />
            JumpX
          </span>
          <div className="jx-search-wrap jx-search-wrap--sm">
            {SEARCH_ICON}
            <input
              ref={stickySearchRef}
              data-jx-search="true"
              className="jx-search jx-search--sm"
              type="search"
              autoComplete="off"
              placeholder="QUERY / 工具…"
              value={searchInput}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="jx-my-toggle"
            data-active={myView}
            onClick={toggleMyView}
            title={myView ? "退出 MY 视图" : "查看我标记的工具"}
            aria-pressed={myView}
          >
            ★ MY <span className="jx-tab-count">{favCount}</span>
          </button>
          <button
            ref={catTriggerRef}
            type="button"
            className="jx-cat-trigger"
            aria-haspopup="true"
            aria-expanded={catMenuOpen}
            onClick={() => setCatMenuOpen((v) => !v)}
            title="切换分类"
          >
            <span className="jx-cat-trigger-label">/{activeCategoryLabel}</span>
            <span className="jx-cat-trigger-arrow" aria-hidden>
              ▾
            </span>
          </button>
          <button
            type="button"
            className="jx-icon-btn jx-icon-btn--sm"
            onClick={cycleTheme}
            title={`主题：${themeMode === "light" ? "浅色" : themeMode === "dark" ? "深色" : "跟随系统"}`}
            aria-label="切换浅色 / 深色 / 跟随系统"
          >
            {themeLabel}
          </button>
        </div>
        {catMenuOpen ? (
          <div className="jx-cat-menu" ref={catMenuRef} role="listbox" aria-label="分类">
            <div className="jx-cat-menu-inner">
              <button
                type="button"
                className="jx-cat-item"
                data-active={!myView && categoryId === ALL_CATEGORY_ID}
                onClick={() => {
                  selectCategory(ALL_CATEGORY_ID);
                  setCatMenuOpen(false);
                }}
              >
                <span>ALL</span>
                <span className="jx-tab-count">{totalCount}</span>
              </button>
              {categoryEntries.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  className="jx-cat-item"
                  data-active={!myView && categoryId === c.name}
                  onClick={() => {
                    selectCategory(c.name);
                    setCatMenuOpen(false);
                  }}
                >
                  <span>{c.name}</span>
                  <span className="jx-tab-count">{c.count}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <header className="jx-hero">
        <div className="jx-inner">
          <div className="jx-brand">
            <div className="jx-brand-left">
              <span className="jx-logo">
                <span className="jx-logo-dot" />
                JumpX · Tool Index
              </span>
              <h1 className="jx-title">
                <mark>{payload.siteTitle.split(" ")[0]}</mark>
                {payload.siteTitle.includes(" ") ? ` ${payload.siteTitle.split(" ").slice(1).join(" ")}` : ""}
              </h1>
              {payload.tagline ? <p className="jx-tagline">{payload.tagline}</p> : null}
            </div>
            <button
              type="button"
              className="jx-icon-btn"
              onClick={cycleTheme}
              title={`主题：${themeMode === "light" ? "浅色" : themeMode === "dark" ? "深色" : "跟随系统"}`}
              aria-label="切换浅色 / 深色 / 跟随系统"
            >
              {themeLabel}
            </button>
          </div>

          <div className="jx-section-head">
            <span className="eyebrow">SEARCH · {pad(totalCount)} ENTRIES</span>
            <span className="eyebrow">/{activeCategoryLabel}</span>
          </div>
          <div className="jx-search-wrap">
            {SEARCH_ICON}
            <input
              ref={heroSearchRef}
              data-jx-search="true"
              id="jx-search"
              className="jx-search"
              type="search"
              autoComplete="off"
              placeholder="QUERY / 工具、描述、链接、拼音…"
              value={searchInput}
              onChange={(e) => onSearchChange(e.target.value)}
            />
            <p className="jx-hint">
              <kbd>/</kbd> 聚焦 · <kbd>Enter</kbd> 打开首条结果 · 向下滚动后右上角分类菜单始终可用
            </p>
          </div>

          <div className="jx-section-head">
            <span className="eyebrow">CATEGORIES · {pad(categoryEntries.length + 1, 2)}</span>
          </div>
          <div className="jx-tabs" role="tablist" aria-label="分类">
            <button
              type="button"
              role="tab"
              className="jx-tab"
              data-active={!myView && categoryId === ALL_CATEGORY_ID}
              onClick={() => selectCategory(ALL_CATEGORY_ID)}
            >
              ALL <span className="jx-tab-count">{totalCount}</span>
            </button>
            <button
              type="button"
              role="tab"
              className="jx-tab jx-tab--my"
              data-active={myView}
              onClick={toggleMyView}
              title={myView ? "退出 MY 视图" : "只看我标记的工具"}
            >
              ★ MY <span className="jx-tab-count">{favCount}</span>
            </button>
            {categoryEntries.map((c) => (
              <button
                type="button"
                role="tab"
                key={c.name}
                className="jx-tab"
                data-active={!myView && categoryId === c.name}
                onClick={() => selectCategory(c.name)}
              >
                {c.name} <span className="jx-tab-count">{c.count}</span>
              </button>
            ))}
          </div>
        </div>
        <div ref={sentinelRef} className="jx-sticky-sentinel" aria-hidden />
      </header>

      <main className="jx-main">
        <div className="jx-results-bar">
          <span>
            FILTER · <strong>/{activeCategoryLabel}</strong>
            {searchQuery.trim() ? (
              <>
                {" "}· QUERY · <span className="jx-bar-accent">{searchQuery.trim()}</span>
              </>
            ) : null}
          </span>
          <span>
            <strong>{pad(visibleCount)}</strong> / {pad(totalCount)} RESULTS
          </span>
        </div>

        {filtered.length === 0 ? (
          <div className="jx-empty">
            {myView ? (
              <p>
                MY 视图为空 · 在任意工具卡右上角点 <mark>MARK</mark> 即可加入「在用 / 想用」
              </p>
            ) : searchQuery.trim() ? (
              <p>
                NO MATCH FOR <mark>{searchQuery.trim()}</mark> IN /{activeCategoryLabel} ·
                {" "}试试切换到「全部」或清空搜索
              </p>
            ) : (
              <p>EMPTY · 该分类下暂无条目</p>
            )}
          </div>
        ) : groupedFiltered ? (
          (() => {
            let cursor = 0;
            return groupedFiltered.map((group) => (
              <section
                key={group.name}
                className="jx-section"
                id={`cat-${group.name.replace(/\s+/g, "-")}`}
              >
                <h2 className="jx-section-title">
                  <span>
                    <span className="jx-section-tag">//</span>
                    {group.name}
                  </span>
                  <span className="jx-section-count">{pad(group.items.length, 2)} ENTRIES</span>
                </h2>
                <div className="jx-grid">
                  {group.items.map((tool) => {
                    const idx = cursor++;
                    return (
                      <ToolCard
                        key={`${tool.category}-${tool.name}-${tool.url}-${idx}`}
                        tool={tool}
                        index={idx}
                        showIndex={showIndex}
                        showCategoryMeta={false}
                        favStatus={getFavStatus(tool.url)}
                        onToggleFav={cycleFav}
                      />
                    );
                  })}
                </div>
              </section>
            ));
          })()
        ) : (
          <div className="jx-grid">
            {filtered.map((tool, index) => (
              <ToolCard
                key={`${tool.category}-${tool.name}-${tool.url}-${index}`}
                tool={tool}
                index={index}
                showIndex={showIndex}
                showCategoryMeta={false}
                favStatus={getFavStatus(tool.url)}
                onToggleFav={cycleFav}
              />
            ))}
          </div>
        )}
      </main>

      <footer className="jx-footer">
        SRC · <code>README.md</code> · BUILD · <code>npm run parse</code> · v0.1
      </footer>
    </div>
  );
}
