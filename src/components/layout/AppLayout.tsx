import { BookOpen, Gift, ImageIcon, Layers3, Scissors, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import brandIconMountain from "../../assets/brand-icon-mountain.svg";
import { MENU_ITEMS } from "../../utils/constants";

const iconMap = {
  image: ImageIcon,
  layers: Layers3,
  gift: Gift,
  scissors: Scissors,
  book: BookOpen,
  shield: ShieldCheck,
};

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "sidebar--open" : ""}`}>
        <div className="brand">
          <div className="brand__mark" aria-hidden="true">
            <img src={brandIconMountain} alt="" className="brand__icon" />
          </div>
          <div>
            <strong>이미지 필터</strong>
          </div>
        </div>

        <nav className="nav-list" aria-label="주요 메뉴">
          {MENU_ITEMS.map((item) => {
            const Icon = iconMap[item.icon];
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) => `nav-item ${isActive ? "nav-item--active" : ""}`}
                onClick={() => setSidebarOpen(false)}
              >
                <Icon size={23} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="help-card-stack">
          <div className="help-card help-card--notice">
            <strong>생성이 잘 되지 않을 경우</strong>
            <p>
              결과가 만족스럽지 않으면
              <br />
              remove.bg에서 먼저 누끼를 만든 뒤 다시 업로드해 주세요.
            </p>
            <a href="https://www.remove.bg/ko" target="_blank" rel="noreferrer">
              remove.bg 바로가기
            </a>
          </div>

          <div className="help-card help-card--guide-only">
            <NavLink to="/guide" className="button button--outline button--full" onClick={() => setSidebarOpen(false)}>
              이미지 가이드보기
            </NavLink>
          </div>

          <div className="help-card help-card--product-filter">
            <a
              href="https://ddingshop-product-name-filter.pages.dev/"
              target="_blank"
              rel="noreferrer"
              className="button button--blue button--full"
            >
              상품명 필터 바로가기
            </a>
          </div>
        </div>
      </aside>

      <div className="app-main">
        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
