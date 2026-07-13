import { useEffect, useState } from "react";
import { FiBox, FiFileText, FiX } from "react-icons/fi";
import packageJson from "../../package.json";
import svgRaw from "../../../res/svgdesigner.svg?raw";
import licenseText from "../../../LICENSE?raw";
import nexLicenseText from "../../../nex-LICENSE?raw";
import { NexLogo } from "../components/NexLogo.jsx";
import { VltLogo } from "../components/VltLogo.jsx";
import * as nex from "../lib/nex.js";
import "../styles/About.css";
import "../styles/modal.css";

const IT_MONTHS = {
  gennaio: "January", febbraio: "February", marzo: "March", aprile: "April",
  maggio: "May", giugno: "June", luglio: "July", agosto: "August",
  settembre: "September", ottobre: "October", novembre: "November", dicembre: "December",
};

function fmtDate(str) {
  if (!str) return str;
  return str.replace(/[a-zA-ZÀ-ú]+/g, (w) => IT_MONTHS[w.toLowerCase()] ?? w);
}

const LEGAL = [
  "This software is released under a Proprietary Source-Available License. The source code may be read and studied, but may not be modified, redistributed, reverse-engineered, or used for commercial purposes without prior written permission.",
  "The bundled nex framework is subject to its own Proprietary Source-Available License. All rights reserved by Veronesi Lorenzo (vlT).",
  "All SVG processing (optimize, prettify, React and React Native export) is performed locally on your device. No data is sent to any external server.",
  "The software is provided as-is, without warranty of any kind. The author is not liable for any data loss or damages arising from its use.",
];

function LicenseModal({ onClose }) {
  return (
    <div className="emd-backdrop" onClick={onClose}>
      <div className="emd-panel emd-panel--wide" onClick={(e) => e.stopPropagation()}>
        <div className="emd-header">
          <div className="emd-header__icon emd-header__icon--node">
            <FiFileText size={20} />
          </div>
          <div className="emd-header__body">
            <div className="emd-header__name">License</div>
            <div className="emd-header__meta">Source-Available License — SVG Designer</div>
          </div>
          <div className="emd-header__right">
            <button className="emd-close" onClick={onClose}><FiX size={14} /></button>
          </div>
        </div>
        <div className="emd-body">
          <pre className="about-license-pre">{licenseText}</pre>
        </div>
      </div>
    </div>
  );
}

function NexLicenseModal({ onClose }) {
  return (
    <div className="emd-backdrop" onClick={onClose}>
      <div className="emd-panel emd-panel--wide" onClick={(e) => e.stopPropagation()}>
        <div className="emd-header">
          <div className="emd-header__icon emd-header__icon--node">
            <FiFileText size={20} />
          </div>
          <div className="emd-header__body">
            <div className="emd-header__name">nex framework license</div>
            <div className="emd-header__meta">Source-Available License — vlT</div>
          </div>
          <div className="emd-header__right">
            <button className="emd-close" onClick={onClose}><FiX size={14} /></button>
          </div>
        </div>
        <div className="emd-body">
          <pre className="about-license-pre">{nexLicenseText}</pre>
        </div>
      </div>
    </div>
  );
}

function FrameworkModal({ framework, stack, onClose }) {
  const [nexLicOpen, setNexLicOpen] = useState(false);

  const frameworkLabel = framework ? `${framework.name}@${framework.version}` : "nex";
  const buildLabel = framework
    ? `${framework.build} · ${fmtDate(framework.updated)}`
    : "loading";
  const stackRows = [
    ["Go", stack?.go],
    ["webview", stack?.webview_go],
    ["zenity", stack?.zenity],
  ].filter(([, v]) => v);

  return (
    <>
      <div className="emd-backdrop" onClick={onClose}>
        <div className="emd-panel emd-panel--wide" onClick={(e) => e.stopPropagation()}>
          <div className="emd-header">
            <div className="emd-header__icon emd-header__icon--node">
              <FiBox size={20} />
            </div>
            <div className="emd-header__body">
              <div className="emd-header__name">nex framework</div>
              <div className="emd-header__meta">{frameworkLabel} · {buildLabel}</div>
            </div>
            <div className="emd-header__right">
              <button className="emd-close" onClick={onClose}><FiX size={14} /></button>
            </div>
          </div>
          <div className="emd-body">
            <div className="about-nex-brand">
              <NexLogo animated={false} className="about-nex-logo" size="about" />
            </div>
            <div className="about-nex-grid">
              <div><span>Version</span><strong>{framework?.version ?? "…"}</strong></div>
              <div><span>Build</span><strong>{framework?.build ?? "…"}</strong></div>
              <div><span>Updated</span><strong>{fmtDate(framework?.updated) ?? "…"}</strong></div>
            </div>
            {stackRows.length > 0 && (
              <div className="about-nex-stack">
                {stackRows.map(([label, value]) => (
                  <div key={label}><span>{label}</span><code>{value}</code></div>
                ))}
              </div>
            )}
            <p className="about-nex-notice">
              nex is the exclusive intellectual property of vlT — Veronesi Lorenzo. All rights reserved.{" "}
              <button
                className="about-nex-notice-link"
                onClick={(e) => { e.stopPropagation(); setNexLicOpen(true); }}
              >
                View license
              </button>
            </p>
          </div>
        </div>
      </div>
      {nexLicOpen && <NexLicenseModal onClose={() => setNexLicOpen(false)} />}
    </>
  );
}

export default function About() {
  const [licenseOpen, setLicenseOpen] = useState(false);
  const [frameworkOpen, setFrameworkOpen] = useState(false);
  const [appInfo, setAppInfo] = useState(null);
  const [frameworkInfo, setFrameworkInfo] = useState(null);
  const [frameworkStack, setFrameworkStack] = useState({});

  useEffect(() => {
    nex.app.info().then(setAppInfo).catch(() => {});
    nex.framework.info().then(setFrameworkInfo).catch(() => {});
    nex.framework.stack().then(setFrameworkStack).catch(() => {});
  }, []);

  const info = [
    { label: "Version",       value: appInfo?.version ?? packageJson.version },
    { label: "Build",         value: appInfo?.build ?? packageJson.build },
    { label: "Last Update",   value: fmtDate(appInfo?.updated ?? packageJson.updated) },
    { label: "Initial Build", value: packageJson.ibuild },
    { label: "License",       value: "Source-Available", action: () => setLicenseOpen(true),  Icon: FiFileText },
    { label: "Runtime",       value: frameworkInfo ? `nex ${frameworkInfo.version} · ${frameworkInfo.build}` : "nex", action: () => setFrameworkOpen(true), Icon: FiBox },
  ];

  return (
    <div className="about">
      <div className="about-hero">
        <div
          className="about-hero__icon"
          aria-label="SVG Designer"
          dangerouslySetInnerHTML={{ __html: svgRaw }}
        />
        <div className="about-hero__name">SVG Designer Studio</div>
        <div className="about-hero__desc">
          SVG Designer Studio — based on{" "}
          <span className="about-hero__badge">nex desktop framework</span>
        </div>
        <div className="about-info-grid">
          {info.map(({ label, value, action, Icon }) =>
            action ? (
              <div key={label} className="about-info-cell about-info-cell--link" onClick={action}>
                <div className="about-info-cell__label">{label}</div>
                <div className="about-info-cell__value about-info-cell__value--link">
                  {value} <Icon size={11} style={{ verticalAlign: "middle", marginLeft: 3 }} />
                </div>
              </div>
            ) : (
              <div key={label} className="about-info-cell">
                <div className="about-info-cell__label">{label}</div>
                <div className="about-info-cell__value">{value}</div>
              </div>
            )
          )}
        </div>
      </div>

      <div className="about-card">
        <div className="about-card__title">Legal notices & disclaimer</div>
        <ul className="about-legal">
          {LEGAL.map((text, i) => <li key={i}>{text}</li>)}
        </ul>
      </div>

      <div className="about-footer">
        <VltLogo className="about-footer__logo" size="36px" staticExpanded />
        <div className="about-footer__copy">{packageJson.author}</div>
      </div>

      {licenseOpen && <LicenseModal onClose={() => setLicenseOpen(false)} />}
      {frameworkOpen && (
        <FrameworkModal
          framework={frameworkInfo}
          stack={frameworkStack}
          onClose={() => setFrameworkOpen(false)}
        />
      )}
    </div>
  );
}
