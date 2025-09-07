// SillyTavern Message Format Replacer Extension (No CSS Version)
console.log('MFR: Extension script started loading...');

try {
    (function () {
        'use strict';

        const extensionName = 'message-format-replacer';
        let settings = {
            enabled: true,
            messageOffset: 6,
            tagName: 'format',
            skipEveryN: false,
            skipEveryNPlus1: false,
            skipInterval: 18
        };

        // 설정 로드/저장
        function loadSettings() {
            try {
                const saved = localStorage.getItem(`${extensionName}_settings`);
                if (saved) {
                    const parsedSettings = JSON.parse(saved);
                    settings = { ...settings, ...parsedSettings };
                }
                console.log('MFR: Settings loaded:', settings);
            } catch (e) {
                console.error('MFR: Failed to load settings:', e);
            }
        }

        function saveSettings() {
            try {
                localStorage.setItem(`${extensionName}_settings`, JSON.stringify(settings));
                console.log('MFR: Settings saved:', settings);
            } catch (e) {
                console.error('MFR: Failed to save settings:', e);
            }
        }

        // 채팅 데이터 가져오기
        function getChatData() {
            if (window.chat && Array.isArray(window.chat)) {
                return window.chat;
            }

            if (window.SillyTavern && window.SillyTavern.getContext) {
                const context = window.SillyTavern.getContext();
                if (context && context.chat) {
                    return context.chat;
                }
            }

            if (typeof chat !== 'undefined' && Array.isArray(chat)) {
                return chat;
            }

            return null;
        }

        // 채팅 저장
        function saveChatData() {
            try {
                if (window.SillyTavern && typeof window.SillyTavern.saveChat === 'function') {
                    window.SillyTavern.saveChat();
                } else if (typeof saveChat === 'function') {
                    saveChat();
                } else if (typeof saveChatConditional === 'function') {
                    saveChatConditional();
                } else if (typeof window.saveChat === 'function') {
                    window.saveChat();
                }
            } catch (e) {
                console.error('MFR: Failed to save chat:', e);
            }
        }

        // 메시지 스킵 여부 확인
        function shouldSkipMessage(messageId) {
            // 하나라도 선택하면 메시지번호 0은 자동으로 적용 x
            if ((settings.skipEveryN || settings.skipEveryNPlus1) && messageId === 0) {
                return true;
            }

            const interval = settings.skipInterval || 18;
            const remainder = messageId % interval;

            // n개의 배수 스킵 (18, 36, 54...)
            if (settings.skipEveryN && remainder === 0) {
                return true;
            }

            // n+1개의 배수 스킵 (19, 37, 55...) - ID 1은 제외
            if (settings.skipEveryNPlus1 && remainder === 1 && messageId !== 1) {
                return true;
            }

            return false;
        }

        // 단일 메시지 처리 (최신 메시지 id의 6개 전 메시지)
        function processMessageFormat() {
            if (!settings.enabled) return;

            const chatData = getChatData();
            if (!chatData || chatData.length === 0) return;

            // 최근 메시지 id에서 messageOffset만큼 뺀 인덱스
            const targetIndex = Math.max(0, chatData.length - 1 - settings.messageOffset);

            if (targetIndex < chatData.length && targetIndex >= 0) {
                const targetMessage = chatData[targetIndex];

                if (!targetMessage || !targetMessage.mes) return;

                const targetMessageId = targetMessage.id !== undefined ? targetMessage.id : targetIndex;

                if (shouldSkipMessage(targetMessageId)) return;

                processMessage(targetMessage, targetIndex);
                saveChatData();
                updateAllMessageDisplays();
            }
        }

        // 전체 메시지 처리 (최근 n개 제외)
        function processAllMessages() {
            const chatData = getChatData();
            if (!chatData || chatData.length === 0) return 0;

            const excludeCount = settings.messageOffset || 6;
            const endIndex = Math.max(0, chatData.length - excludeCount);
            let processedCount = 0;

            for (let i = 0; i < endIndex; i++) {
                const message = chatData[i];
                if (!message || !message.mes) continue;

                const messageId = message.id !== undefined ? message.id : i;
                if (shouldSkipMessage(messageId)) continue;

                if (processMessage(message, i)) {
                    processedCount++;
                }
            }

            if (processedCount > 0) {
                saveChatData();
                updateAllMessageDisplays();
            }

            return processedCount;
        }

        // 메시지 하나 처리 (중복 처리 방지 개선)
        function processMessage(message, index) {
            const tagName = settings.tagName || 'format';
            const originalContent = message.mes;
            
            // 처리할 태그를 찾되, 이미 ((()))로 감싸진 것은 제외
            const wrappedTagRegex = new RegExp(`\\(\\(\\(<${tagName}[^>]*>[\\s\\S]*?<\\/${tagName}>\\)\\)\\)`, 'gi');
            const formatTagRegex = new RegExp(`<${tagName}([^>]*)>([\\s\\S]*?)<\\/${tagName}>`, 'gi');
            
            // 먼저 이미 처리된 태그들의 위치를 파악
            const wrappedRanges = [];
            let wrappedMatch;
            while ((wrappedMatch = wrappedTagRegex.exec(originalContent)) !== null) {
                wrappedRanges.push({
                    start: wrappedMatch.index,
                    end: wrappedMatch.index + wrappedMatch[0].length
                });
            }
            
            // 처리되지 않은 태그만 찾아서 감싸기
            let hasChanges = false;
            let newContent = originalContent;
            let offset = 0; // 문자열 길이 변화로 인한 오프셋
            
            formatTagRegex.lastIndex = 0; // 정규식 인덱스 리셋
            let formatMatch;
            const replacements = [];
            
            while ((formatMatch = formatTagRegex.exec(originalContent)) !== null) {
                const matchStart = formatMatch.index;
                const matchEnd = formatMatch.index + formatMatch[0].length;
                
                // 이 태그가 이미 처리된 범위 안에 있는지 확인
                let isAlreadyWrapped = false;
                for (const range of wrappedRanges) {
                    if (matchStart >= range.start && matchEnd <= range.end) {
                        isAlreadyWrapped = true;
                        break;
                    }
                }
                
                if (!isAlreadyWrapped) {
                    replacements.push({
                        start: matchStart,
                        end: matchEnd,
                        original: formatMatch[0],
                        replacement: `(((<${tagName}${formatMatch[1]}>${formatMatch[2]}</${tagName}>)))`
                    });
                }
            }
            
            // 뒤에서부터 앞으로 교체 (인덱스 변화 방지)
            replacements.reverse().forEach(replacement => {
                newContent = newContent.substring(0, replacement.start) + 
                           replacement.replacement + 
                           newContent.substring(replacement.end);
                hasChanges = true;
            });

            if (hasChanges && newContent !== originalContent) {
                message.mes = newContent;
                return true;
            }

            return false;
        }

        // 모든 ((())) 블록 제거
        function removeAllHiddenBlocks() {
            const chatData = getChatData();
            if (!chatData || chatData.length === 0) return 0;

            const hiddenBlockRegex = /\(\(\([\s\S]*?\)\)\)/g;
            let removedCount = 0;

            for (let i = 0; i < chatData.length; i++) {
                const message = chatData[i];
                if (!message || !message.mes) continue;

                const originalContent = message.mes;
                const newContent = originalContent.replace(hiddenBlockRegex, '');

                if (newContent !== originalContent) {
                    message.mes = newContent;
                    removedCount++;
                }
            }

            if (removedCount > 0) {
                saveChatData();
                updateAllMessageDisplays();
            }

            return removedCount;
        }

        // 메시지 화면 업데이트
        function updateMessageDisplay(messageIndex) {
            setTimeout(() => {
                const messageElement = document.querySelector(`[mesid="${messageIndex}"]`);
                if (messageElement) {
                    const chatData = getChatData();
                    if (!chatData) return;

                    const message = chatData[messageIndex];
                    const messageContent = messageElement.querySelector('.mes_text');

                    if (messageContent && message && message.mes) {
                        messageContent.innerHTML = message.mes;
                        hideHiddenBlocks(messageContent);
                    }
                }
            }, 100);
        }

        // 전체 메시지 화면 업데이트
        function updateAllMessageDisplays() {
            setTimeout(() => {
                document.querySelectorAll('.mes').forEach((messageElement, index) => {
                    const messageContent = messageElement.querySelector('.mes_text');
                    if (messageContent) {
                        hideHiddenBlocks(messageContent);
                    }
                });
            }, 100);
        }

        // ((())) 블록 숨기기
        function hideHiddenBlocks(element) {
            if (!element) return;

            const hiddenBlockRegex = /\(\(\([\s\S]*?\)\)\)/g;
            let html = element.innerHTML;

            html = html.replace(hiddenBlockRegex, '<span style="display: none;">$&</span>');
            element.innerHTML = html;
        }

        // 알림창 표시
        function showToast(message, type = 'success') {
            if (typeof toastr !== 'undefined') {
                toastr[type](message);
            } else {
                alert(message);
            }
        }

        // 설정 UI 생성
        function createSettingsUI() {
            console.log('MFR: Creating settings UI...');

            // 기존 설정이 있다면 제거
            $('#mfr_enabled').closest('.wide100p').remove();

            const settingsHtml = `
                <div class="wide100p">
                    <div class="title_restoregenerationdata" data-i18n="Message Format Replacer">
                        <div class="inline-drawer-toggle inline-drawer-header">
                            <b>메시지 포맷 치환기</b>
                            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                        </div>
                    </div>
                    <div class="inline-drawer-content">
                        <label class="checkbox_label">
                            <input type="checkbox" id="mfr_enabled" ${settings.enabled ? 'checked' : ''}>
                            포맷 치환기 활성화
                        </label>
                        
                        <label for="mfr_tag_name">태그명:</label>
                        <input type="text" id="mfr_tag_name" class="text_pole" value="${settings.tagName}" placeholder="format" style="margin-bottom: 10px;">
                        
                        <label for="mfr_offset">최신 메시지로부터 거슬러 올라갈 개수:</label>
                        <input type="number" id="mfr_offset" class="text_pole" value="${settings.messageOffset}" min="1" max="50" style="margin-bottom: 10px;">
                        
                        <div style="margin: 10px 0;">
                            <label class="checkbox_label">
                                <input type="checkbox" id="mfr_skip_every_n" ${settings.skipEveryN ? 'checked' : ''}>
                                매 <input type="number" id="mfr_skip_interval_1" class="text_pole" value="${settings.skipInterval}" min="1" max="100" style="width: 60px; margin: 0 5px;"> 개 배수 제외
                            </label>
                        </div>
                        
                        <div style="margin: 10px 0;">
                            <label class="checkbox_label">
                                <input type="checkbox" id="mfr_skip_every_n_plus1" ${settings.skipEveryNPlus1 ? 'checked' : ''}>
                                매 <input type="number" id="mfr_skip_interval_2" class="text_pole" value="${settings.skipInterval}" min="1" max="100" style="width: 60px; margin: 0 5px;"> +1 개 배수 제외
                            </label>
                        </div>
                        
                        <div style="margin: 15px 0; display: flex; flex-wrap: wrap; gap: 10px;">
                            <div class="menu_button" id="mfr_manual_process" style="flex: 1; min-width: 140px; max-width: 170px;">
                                <i class="fa-solid fa-play"></i> 단일 처리
                            </div>
                            
                            <div class="menu_button" id="mfr_process_all" style="flex: 1; min-width: 140px; max-width: 170px;">
                                <i class="fa-solid fa-list"></i> 전체 처리
                            </div>
                            
                            <div class="menu_button" id="mfr_remove_hidden" style="flex: 1; min-width: 140px; max-width: 170px;">
                                <i class="fa-solid fa-eraser"></i> 숨김 블록 제거
                            </div>
                            
                            <div class="menu_button" id="mfr_reset" style="flex: 1; min-width: 140px; max-width: 170px;">
                                <i class="fa-solid fa-undo"></i> 초기화
                            </div>
                        </div>
                    </div>
                </div>
            `;

            $('#extensions_settings').append(settingsHtml);
            bindEvents();

            // 접기/펼치기 이벤트 바인딩 (SillyTavern 표준)
            $('#extensions_settings').on('click', '.inline-drawer-toggle', function () {
                const $header = $(this);
                const $content = $header.closest('.wide100p').find('.inline-drawer-content');
                const $icon = $header.find('.inline-drawer-icon');

                if ($content.is(':visible')) {
                    $content.slideUp(200);
                    $icon.removeClass('up').addClass('down').removeClass('fa-circle-chevron-up').addClass('fa-circle-chevron-down');
                } else {
                    $content.slideDown(200);
                    $icon.removeClass('down').addClass('up').removeClass('fa-circle-chevron-down').addClass('fa-circle-chevron-up');
                }
            });
        }

        // 이벤트 바인딩
        function bindEvents() {
            $('#mfr_enabled').on('change', function () {
                settings.enabled = this.checked;
                saveSettings();
            });

            $('#mfr_tag_name').on('input', function () {
                settings.tagName = this.value.trim() || 'format';
                saveSettings();
            });

            $('#mfr_offset').on('change', function () {
                settings.messageOffset = parseInt(this.value) || 6;
                saveSettings();
            });

            $('#mfr_skip_every_n').on('change', function () {
                settings.skipEveryN = this.checked;
                saveSettings();
            });

            $('#mfr_skip_every_n_plus1').on('change', function () {
                settings.skipEveryNPlus1 = this.checked;
                saveSettings();
            });

            $('#mfr_skip_interval_1, #mfr_skip_interval_2').on('change', function () {
                const value = parseInt(this.value) || 18;
                settings.skipInterval = value;
                $('#mfr_skip_interval_1, #mfr_skip_interval_2').val(value);
                saveSettings();
            });

            // 단일 처리 버튼
            $('#mfr_manual_process').on('click', function () {
                const $this = $(this);
                const $icon = $this.find('i');
                $icon.removeClass('fa-play').addClass('fa-spinner fa-spin');

                setTimeout(() => {
                    processMessageFormat();
                    $icon.removeClass('fa-spinner fa-spin').addClass('fa-check');
                    setTimeout(() => $icon.removeClass('fa-check').addClass('fa-play'), 1000);
                }, 100);
            });

            // 전체 처리 버튼
            $('#mfr_process_all').on('click', function () {
                const $this = $(this);
                const $icon = $this.find('i');
                $icon.removeClass('fa-list').addClass('fa-spinner fa-spin');

                setTimeout(() => {
                    const count = processAllMessages();
                    $icon.removeClass('fa-spinner fa-spin').addClass('fa-check');

                    showToast(`${count}개 메시지 처리 완료`);

                    setTimeout(() => $icon.removeClass('fa-check').addClass('fa-list'), 2000);
                }, 100);
            });

            // 숨김 블록 제거 버튼
            $('#mfr_remove_hidden').on('click', function () {
                const $this = $(this);
                const $icon = $this.find('i');
                $icon.removeClass('fa-eraser').addClass('fa-spinner fa-spin');

                setTimeout(() => {
                    const count = removeAllHiddenBlocks();
                    $icon.removeClass('fa-spinner fa-spin').addClass('fa-check');

                    showToast(`${count}개 숨김 블록 제거 완료`);

                    setTimeout(() => $icon.removeClass('fa-check').addClass('fa-eraser'), 2000);
                }, 100);
            });

            // 초기화 버튼
            $('#mfr_reset').on('click', function () {
                settings = {
                    enabled: true,
                    messageOffset: 6,
                    tagName: 'format',
                    skipEveryN: false,
                    skipEveryNPlus1: false,
                    skipInterval: 18
                };
                saveSettings();

                $('#mfr_enabled').prop('checked', settings.enabled);
                $('#mfr_tag_name').val(settings.tagName);
                $('#mfr_offset').val(settings.messageOffset);
                $('#mfr_skip_every_n').prop('checked', settings.skipEveryN);
                $('#mfr_skip_every_n_plus1').prop('checked', settings.skipEveryNPlus1);
                $('#mfr_skip_interval_1, #mfr_skip_interval_2').val(settings.skipInterval);
            });
        }

        // 자동 처리 설정
        function setupAutoProcessing() {
            const observer = new MutationObserver((mutations) => {
                let shouldProcess = false;

                mutations.forEach((mutation) => {
                    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                        for (let node of mutation.addedNodes) {
                            if (node.nodeType === Node.ELEMENT_NODE &&
                                (node.classList?.contains('mes') ||
                                    node.querySelector?.('.mes'))) {
                                shouldProcess = true;
                                break;
                            }
                        }
                    }
                });

                if (shouldProcess) {
                    setTimeout(() => {
                        processMessageFormat();
                    }, 1000);
                }
            });

            const chatContainer = document.querySelector('#chat');
            if (chatContainer) {
                observer.observe(chatContainer, {
                    childList: true,
                    subtree: true
                });
            }
        }

        // 확장프로그램 초기화 (충돌 방지 개선)
        function initialize() {
            try {
                loadSettings();

                function waitForJQuery() {
                    if (typeof $ !== 'undefined' && $('#extensions_settings').length > 0) {
                        // 다른 확장과의 충돌 방지를 위한 네임스페이스 체크
                        if (!window[extensionName]) {
                            createSettingsUI();
                            setupAutoProcessing();

                            setTimeout(() => {
                                updateAllMessageDisplays();
                            }, 1000);

                            // 전역 접근을 위한 객체 등록
                            window[extensionName] = {
                                processMessageFormat: processMessageFormat,
                                processAllMessages: processAllMessages,
                                removeAllHiddenBlocks: removeAllHiddenBlocks,
                                settings: settings,
                                getChatData: getChatData,
                                shouldSkipMessage: shouldSkipMessage,
                                hideHiddenBlocks: hideHiddenBlocks
                            };

                            console.log('MFR: Extension loaded successfully!');
                        } else {
                            console.log('MFR: Extension already loaded, skipping initialization');
                        }
                    } else {
                        setTimeout(waitForJQuery, 500);
                    }
                }

                // DOM 준비 상태에 따른 초기화
                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', waitForJQuery);
                } else {
                    // 지연 실행으로 다른 확장들이 먼저 로드되도록 함
                    setTimeout(waitForJQuery, 1000);
                }

            } catch (error) {
                console.error('MFR: Error during initialization:', error);
            }
        }

        initialize();

    })();

} catch (error) {
    console.error('MFR: Critical error in extension:', error);
}
