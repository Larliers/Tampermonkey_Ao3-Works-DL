// ==UserScript==
// @name         AO3 TXT Downloader
// @namespace    https://archiveofourown.org/
// @version      1.1.0
// @description  在AO3作品页面添加"下载TXT"按钮，包含work meta、preface及全文正文，文件名格式：[作者]-[标题]-[works标号].txt
// @author       Custom
// @match        https://archiveofourown.org/works/*
// @match        https://archiveofourown.gay/works/*
// @exclude      https://archiveofourown.org/works/*/bookmarks
// @exclude      https://archiveofourown.org/works/*/navigate
// @exclude      https://archiveofourown.org/works/*/collections
// @grant        GM_xmlhttpRequest
// @connect      archiveofourown.org
// @connect      archiveofourown.gay
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // 只在 /works/数字 或 /works/数字/chapters/数字 页面运行
    const workMatch = location.pathname.match(/^\/works\/(\d+)/);
    if (!workMatch) return;
    const workId = workMatch[1];

    // 插入按钮
    function insertButton() {
        // 找合适的插入位置：下载区域 或 actions 列表
        const downloadList = document.querySelector('.work.meta.group .download ul') ||
                             document.querySelector('ul.work.navigation.actions') ||
                             document.querySelector('#workskin');
        if (!downloadList) return;

        const btn = document.createElement('button');
        btn.id = 'ao3-txt-dl-btn';
        btn.textContent = '⬇ 下载 TXT';
        btn.style.cssText = [
            'display:inline-block',
            'margin:6px 4px',
            'padding:4px 12px',
            'background:#990000',
            'color:#fff',
            'border:none',
            'border-radius:4px',
            'cursor:pointer',
            'font-size:0.9em',
            'font-family:inherit',
        ].join(';');

        btn.addEventListener('mouseenter', () => btn.style.background = '#cc0000');
        btn.addEventListener('mouseleave', () => btn.style.background = '#990000');
        btn.addEventListener('click', onDownload);

        // 插在 download 区域后面，或单独插入
        const dlSection = document.querySelector('.work.meta.group');
        if (dlSection) {
            dlSection.appendChild(btn);
        } else {
            downloadList.prepend(btn);
        }
    }

    // 下载主流程
    function onDownload() {
        const btn = document.getElementById('ao3-txt-dl-btn');
        btn.textContent = '⏳ 获取中...';
        btn.disabled = true;

        const fullWorkUrl = `${location.origin}/works/${workId}?view_full_work=true&view_adult=true`;

        GM_xmlhttpRequest({
            method: 'GET',
            url: fullWorkUrl,
            onload: function (res) {
                try {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(res.responseText, 'text/html');
                    const txt = extractText(doc, workId);
                    triggerDownload(txt.content, txt.filename);
                } catch (e) {
                    alert('解析失败：' + e.message);
                } finally {
                    btn.textContent = '⬇ 下载 TXT';
                    btn.disabled = false;
                }
            },
            onerror: function () {
                alert('请求失败，请检查网络或稍后重试。');
                btn.textContent = '⬇ 下载 TXT';
                btn.disabled = false;
            }
        });
    }

    // ========== 提取文本内容 ==========
    function extractText(doc, workId) {
        const lines = [];

        // ---- 1. Work Meta Group ----
        lines.push('=' .repeat(60));
        lines.push('【Work Meta】');
        lines.push('='.repeat(60));

        const metaDL = doc.querySelector('dl.work.meta.group');
        if (metaDL) {
            const dts = metaDL.querySelectorAll('dt');
            dts.forEach(dt => {
                const label = dt.textContent.trim().replace(/:$/, '');
                // 找对应的 dd
                let dd = dt.nextElementSibling;
                while (dd && dd.tagName !== 'DD') dd = dd.nextElementSibling;
                if (dd) {
                    // 提取 dd 内所有链接文本（tag列表），用逗号分隔；无链接则直接取文本
                    const links = dd.querySelectorAll("a");
                    const value = links.length > 0
                        ? Array.from(links).map(a => a.textContent.trim()).join(", ")
                        : dd.textContent.trim().replace(/\s+/g, " ");
                    lines.push(`${label}: ${value}`);
                }
            });
        } else {
            lines.push('（未找到 work meta）');
        }

        // ---- 2. Preface Group（标题、作者、摘要、前言notes） ----
        lines.push('');
        lines.push('='.repeat(60));
        lines.push('【Preface】');
        lines.push('='.repeat(60));

        const preface = doc.querySelector('#workskin .preface.group');
        if (preface) {
            // 标题
            const titleEl = preface.querySelector('h2.title');
            if (titleEl) lines.push(`标题：${titleEl.textContent.trim()}`);

            // 作者
            const authorEl = preface.querySelector('h3.byline');
            if (authorEl) lines.push(`作者：${authorEl.textContent.trim()}`);

            // 系列
            const seriesEl = preface.querySelector('dd.series');
            if (seriesEl) lines.push(`系列：${seriesEl.textContent.trim().replace(/\s+/g, ' ')}`);

            // 摘要
            const summaryEl = preface.querySelector('.summary .userstuff');
            if (summaryEl) {
                lines.push('');
                lines.push('【摘要】');
                lines.push(getTextContent(summaryEl));
            }

            // 前言 notes
            const notesEl = preface.querySelector('.notes .userstuff');
            if (notesEl) {
                lines.push('');
                lines.push('【作者前言】');
                lines.push(getTextContent(notesEl));
            }
        } else {
            lines.push('（未找到 preface group）');
        }

        // ---- 3. 正文（所有章节） ----
        lines.push('');
        lines.push('='.repeat(60));
        lines.push('【正文】');
        lines.push('='.repeat(60));

        const chapters = doc.querySelectorAll('#chapters .chapter');
        if (chapters.length > 0) {
            chapters.forEach((chap, idx) => {
                // 章节标题
                const chapTitle = chap.querySelector('.preface h3.title');
                if (chapTitle) {
                    lines.push('');
                    lines.push('-'.repeat(40));
                    lines.push(chapTitle.textContent.trim());
                    lines.push('-'.repeat(40));
                } else if (chapters.length > 1) {
                    lines.push('');
                    lines.push(`${'—'.repeat(20)} 第 ${idx + 1} 章 ${'—'.repeat(20)}`);
                }

                // 章节前言 notes
                const chapPreNotes = chap.querySelector('.chapter.preface .notes .userstuff');
                if (chapPreNotes) {
                    lines.push('');
                    lines.push('[章节前言]');
                    lines.push(getTextContent(chapPreNotes));
                }

                // 正文
                const userstuff = chap.querySelector('.userstuff');
                if (userstuff) {
                    lines.push('');
                    lines.push(getTextContent(userstuff));
                }

                // 章节后记 notes
                const chapEndNotes = chap.querySelector('#work_endnotes .userstuff') ||
                                     chap.querySelector('.afterword .notes .userstuff');
                if (chapEndNotes) {
                    lines.push('');
                    lines.push('[章节后记]');
                    lines.push(getTextContent(chapEndNotes));
                }
            });
        } else {
            // 单章或无 .chapter 结构
            const userstuff = doc.querySelector('#chapters .userstuff') ||
                              doc.querySelector('#workskin .userstuff');
            if (userstuff) {
                lines.push('');
                lines.push(getTextContent(userstuff));
            } else {
                lines.push('（未找到正文内容）');
            }
        }

        // ---- 4. 后记 endnotes ----
        const endNotes = doc.querySelector('#work_endnotes .userstuff');
        if (endNotes) {
            lines.push('');
            lines.push('='.repeat(60));
            lines.push('【作者后记】');
            lines.push('='.repeat(60));
            lines.push(getTextContent(endNotes));
        }

        // ---- 文件名 ----
        const authorRaw = doc.querySelector('h3.byline a')?.textContent?.trim() ||
                          doc.querySelector('h3.byline')?.textContent?.trim() ||
                          'Unknown';
        const titleRaw = doc.querySelector('h2.title.heading')?.textContent?.trim() ||
                         doc.querySelector('h2.title')?.textContent?.trim() ||
                         'Untitled';

        const sanitize = s => s.replace(/[\\/:*?"<>|]/g, '_').trim().substring(0, 80);
        const filename = `${sanitize(authorRaw)}-${sanitize(titleRaw)}-${workId}.txt`;

        return { content: lines.join('\n'), filename };
    }

    // ========== HTML → 纯文本（保留段落换行） ==========
    function getTextContent(el) {
        // 递归将 block 元素转为换行
        function walk(node) {
            if (node.nodeType === Node.TEXT_NODE) {
                return node.textContent;
            }
            if (node.nodeType !== Node.ELEMENT_NODE) return '';

            const tag = node.tagName.toLowerCase();
            const children = Array.from(node.childNodes).map(walk).join('');

            const blockTags = ['p','div','br','h1','h2','h3','h4','h5','h6',
                               'li','tr','blockquote','hr','pre','section','article'];
            if (tag === 'hr') return '\n' + '─'.repeat(30) + '\n';
            if (tag === 'br') return '\n';
            if (blockTags.includes(tag)) return '\n' + children + '\n';
            return children;
        }

        const raw = walk(el);
        // 合并多个空行为最多两个
        return raw.replace(/\n{3,}/g, '\n\n').trim();
    }

    // ========== 触发下载 ==========
    function triggerDownload(content, filename) {
        const bom = '\uFEFF'; // UTF-8 BOM，让 Windows 记事本正确识别中文
        const blob = new Blob([bom + content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 1000);
    }

    // ---- 等待页面 DOM 就绪后插入按钮 ----
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', insertButton);
    } else {
        insertButton();
    }

})();
