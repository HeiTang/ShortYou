/**
 * Google Sheet 管理介面：自訂選單 + 對話框 + Email 通知。
 * 讓 admin 在 Sheet 裡按按鈕就能新增 client 並自動寄出 capability link。
 */

// ── HTML 片段工具 ──

function css_(): string {
  return [
    ':root {',
    '  --md-primary: #0b57d0;',
    '  --md-on-primary: #fff;',
    '  --md-surface: #fff;',
    '  --md-on-surface: #1f1f1f;',
    '  --md-on-surface-variant: #444746;',
    '  --md-outline: #747775;',
    '  --md-outline-variant: #c4c7c5;',
    '  --md-error: #b3261e;',
    '  --md-error-container: #f9dedc;',
    '  --md-success: #146c2e;',
    '  --md-success-container: #c4eed0;',
    '  --md-surface-container: #f3f3f3;',
    '  --md-radius-sm: 8px;',
    '  --md-radius-md: 12px;',
    '  --md-radius-full: 100px;',
    '  --md-transition: 200ms cubic-bezier(0.2, 0, 0, 1);',
    '}',
    '* { margin: 0; padding: 0; box-sizing: border-box; }',
    'body {',
    '  font-family: "Google Sans", Roboto, Arial, sans-serif;',
    '  font-size: 14px;',
    '  color: var(--md-on-surface);',
    '  background: var(--md-surface);',
    '  line-height: 1.5;',
    '  padding: 24px;',
    '}',

    // ── Form fields ──
    '.field { margin-bottom: 16px; }',
    '.field-label {',
    '  display: block;',
    '  font-size: 12px;',
    '  font-weight: 500;',
    '  color: var(--md-on-surface-variant);',
    '  margin-bottom: 6px;',
    '  letter-spacing: 0.02em;',
    '}',
    '.field-input {',
    '  width: 100%;',
    '  height: 42px;',
    '  padding: 10px 14px;',
    '  font-size: 14px;',
    '  font-family: inherit;',
    '  color: var(--md-on-surface);',
    '  background: var(--md-surface);',
    '  border: 1px solid var(--md-outline-variant);',
    '  border-radius: var(--md-radius-sm);',
    '  outline: none;',
    '  transition: border-color var(--md-transition), box-shadow var(--md-transition);',
    '}',
    '.field-input:hover { border-color: var(--md-outline); }',
    '.field-input:focus {',
    '  border-color: var(--md-primary);',
    '  box-shadow: 0 0 0 1px var(--md-primary);',
    '}',
    'textarea.field-input { resize: vertical; min-height: 56px; }',

    // ── Row layout ──
    '.row { display: flex; gap: 12px; }',
    '.row > .field { flex: 1; }',

    // ── Hint ──
    '.hint {',
    '  font-size: 11px;',
    '  color: var(--md-outline);',
    '  margin-top: 4px;',
    '}',

    // ── Checkbox ──
    '.cb-row {',
    '  display: flex;',
    '  align-items: center;',
    '  gap: 8px;',
    '  margin-bottom: 12px;',
    '  cursor: pointer;',
    '}',
    '.cb-row input[type="checkbox"] {',
    '  width: 18px; height: 18px;',
    '  accent-color: var(--md-primary);',
    '  cursor: pointer;',
    '}',
    '.cb-row label {',
    '  font-size: 13px;',
    '  color: var(--md-on-surface-variant);',
    '  cursor: pointer;',
    '  user-select: none;',
    '}',

    // ── Messages ──
    '.msg {',
    '  display: none;',
    '  padding: 10px 14px;',
    '  border-radius: var(--md-radius-sm);',
    '  font-size: 13px;',
    '  line-height: 1.4;',
    '  margin-top: 16px;',
    '  animation: msgIn 200ms ease;',
    '}',
    '.msg.error { background: var(--md-error-container); color: var(--md-error); }',
    '.msg.success { background: var(--md-success-container); color: var(--md-success); }',
    '@keyframes msgIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }',

    // ── Buttons ──
    '.actions {',
    '  display: flex;',
    '  justify-content: flex-end;',
    '  gap: 8px;',
    '  margin-top: 20px;',
    '  padding-top: 16px;',
    '  border-top: 1px solid var(--md-outline-variant);',
    '}',
    '.btn {',
    '  padding: 10px 24px;',
    '  font-size: 14px;',
    '  font-weight: 500;',
    '  font-family: inherit;',
    '  border: none;',
    '  border-radius: var(--md-radius-full);',
    '  cursor: pointer;',
    '  transition: background var(--md-transition), box-shadow var(--md-transition);',
    '  letter-spacing: 0.02em;',
    '}',
    '.btn-primary {',
    '  background: var(--md-primary);',
    '  color: var(--md-on-primary);',
    '}',
    '.btn-primary:hover {',
    '  box-shadow: 0 1px 3px rgba(0,0,0,0.2), 0 4px 8px rgba(11,87,208,0.15);',
    '}',
    '.btn-primary:disabled {',
    '  background: var(--md-outline-variant);',
    '  color: var(--md-outline);',
    '  cursor: not-allowed;',
    '  box-shadow: none;',
    '}',
    '.btn-text {',
    '  background: transparent;',
    '  color: var(--md-primary);',
    '}',
    '.btn-text:hover { background: rgba(11, 87, 208, 0.08); }',

    // ── Divider ──
    '.divider { height: 1px; background: var(--md-outline-variant); margin: 16px 0; }',

    // ── Info Icon & Custom Tooltip ──
    '.info-icon {',
    '  display: inline-flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  width: 14px; height: 14px;',
    '  border-radius: 50%;',
    '  background-color: var(--md-outline-variant);',
    '  color: var(--md-surface);',
    '  font-size: 10px;',
    '  font-style: normal;',
    '  font-weight: 600;',
    '  font-family: inherit;',
    '  margin-left: 6px;',
    '  cursor: help;',
    '  position: relative;',
    '}',
    '.info-icon:hover {',
    '  background-color: var(--md-outline);',
    '}',
    '.info-icon::after {',
    '  content: attr(data-tooltip);',
    '  position: absolute;',
    '  top: 50%;',
    '  left: calc(100% + 8px);',
    '  transform: translateY(-50%) scale(0.95);',
    '  background-color: var(--md-on-surface);',
    '  color: var(--md-surface);',
    '  padding: 8px 12px;',
    '  border-radius: 4px;',
    '  font-size: 11px;',
    '  font-weight: 400;',
    '  font-style: normal;',
    '  width: max-content;',
    '  max-width: 250px;',
    '  white-space: normal;',
    '  line-height: 1.4;',
    '  text-align: left;',
    '  pointer-events: none;',
    '  opacity: 0;',
    '  visibility: hidden;',
    '  transition: opacity 150ms ease, transform 150ms ease, visibility 150ms;',
    '  z-index: 100;',
    '  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);',
    '}',
    '.info-icon::before {',
    '  content: "";',
    '  position: absolute;',
    '  top: 50%;',
    '  left: calc(100% + 4px);',
    '  transform: translateY(-50%);',
    '  border-width: 4px 4px 4px 0;',
    '  border-style: solid;',
    '  border-color: transparent var(--md-on-surface) transparent transparent;',
    '  pointer-events: none;',
    '  opacity: 0;',
    '  visibility: hidden;',
    '  transition: opacity 150ms ease, visibility 150ms;',
    '  z-index: 100;',
    '}',
    '.info-icon.tooltip-right::after {',
    '  left: auto;',
    '  right: calc(100% + 8px);',
    '  transform: translateY(-50%) scale(0.95);',
    '}',
    '.info-icon.tooltip-right::before {',
    '  left: auto;',
    '  right: calc(100% + 4px);',
    '  border-width: 4px 0 4px 4px;',
    '  border-color: transparent transparent transparent var(--md-on-surface);',
    '}',
    '.info-icon:hover::after, .info-icon:hover::before {',
    '  opacity: 1;',
    '  visibility: visible;',
    '  transform: translateY(-50%) scale(1);',
    '}',
    '.info-icon:hover::before { transform: translateY(-50%); }'
  ].join('\n');
}

function issueDialogHtml_(): string {
  return '<style>' + css_() + '</style>' +

    '<div class="field">' +
      '<label class="field-label" for="owner">Owner Name *<span class="info-icon" data-tooltip="使用者名稱，用於識別存取權限擁有人，必填項目。">i</span></label>' +
      '<input class="field-input" id="owner" type="text" placeholder="e.g. alice" />' +
    '</div>' +

    '<div class="field">' +
      '<label class="field-label" for="email">Owner Email *<span class="info-icon" data-tooltip="使用者的電子信箱，用來發送包含專屬連結 (Capability Link) 的通知信。Token 僅存 hash，必須透過 email 送達。">i</span></label>' +
      '<input class="field-input" id="email" type="email" placeholder="e.g. alice@example.com" />' +
    '</div>' +

    '<div class="row">' +
      '<div class="field">' +
        '<label class="field-label" for="quota">Daily Quota<span class="info-icon" data-tooltip="該使用者每天可以建立的短網址數量上限，0 代表無數量限制。">i</span></label>' +
        '<input class="field-input" id="quota" type="number" value="50" min="0" />' +
        '<div class="hint">0 = unlimited</div>' +
      '</div>' +
      '<div class="field">' +
        '<label class="field-label" for="expires">Expires At<span class="info-icon tooltip-right" data-tooltip="專屬連結的失效日期，若留空則代表該連結永久有效。">i</span></label>' +
        '<input class="field-input" id="expires" type="date" />' +
        '<div class="hint">Leave empty = no expiration</div>' +
      '</div>' +
    '</div>' +

    '<div class="field">' +
      '<label class="field-label" for="note">Note<span class="info-icon" data-tooltip="可選的備註說明，僅供管理員在後台查看與記錄。">i</span></label>' +
      '<textarea class="field-input" id="note" placeholder="Optional note"></textarea>' +
    '</div>' +

    '<div class="cb-row">' +
      '<input id="force" type="checkbox" />' +
      '<label for="force">Force create even if owner already exists</label>' +
    '</div>' +

    '<div class="msg error" id="errMsg"></div>' +
    '<div class="msg success" id="okMsg"></div>' +

    '<div class="actions">' +
      '<button class="btn btn-text" id="cancelBtn">Cancel</button>' +
      '<button class="btn btn-primary" id="submitBtn">Create</button>' +
    '</div>' +

    '<script>' +
    'document.getElementById("cancelBtn").addEventListener("click",function(){google.script.host.close()});' +
    'document.getElementById("submitBtn").addEventListener("click",onSubmit);' +

    'function onSubmit(){' +
      'var owner=document.getElementById("owner").value.trim();' +
      'var email=document.getElementById("email").value.trim();' +
      'var force=document.getElementById("force").checked;' +
      'var quota=parseInt(document.getElementById("quota").value);' +
      'if(isNaN(quota)||quota<0)quota=50;' +
      'var expiresRaw=document.getElementById("expires").value;' +
      'var expires=expiresRaw?expiresRaw+"T23:59:59Z":"";' +
      'var note=document.getElementById("note").value.trim();' +

      'hideMsg();' +

      'if(!owner){showErr("Owner name is required.");return}' +
      'if(!email||email.indexOf("@")<1){showErr("Valid email is required.");return}' +

      'if(expiresRaw){' +
        'var today=new Date();today.setHours(0,0,0,0);' +
        'var picked=new Date(expiresRaw+"T00:00:00");' +
        'if(picked<today){showErr("Expires date cannot be in the past.");return}' +
      '}' +

      'setLoading(true);' +
      'google.script.run' +
        '.withSuccessHandler(onResult)' +
        '.withFailureHandler(onFail)' +
        '.issueClientFromDialog(owner,email,quota,expires,note,force);' +
    '}' +

    'function onResult(r){' +
      'if(!r){onFail({message:"No response"});return}' +
      'if(!r.success){setLoading(false);showErr(r.error||"Unknown error");return}' +
      'var m="Client issued: "+(r.clientCode||"");' +
      'if(r.emailSent)m+=" — email sent!";' +
      'showOk(m);' +
      'setTimeout(function(){google.script.host.close()},2000);' +
    '}' +

    'function onFail(e){setLoading(false);showErr(e.message||"Script error")}' +

    'function setLoading(on){' +
      'var b=document.getElementById("submitBtn");' +
      'b.disabled=on;b.textContent=on?"Issuing...":"Issue";' +
    '}' +

    'function showErr(m){hideMsg();var e=document.getElementById("errMsg");e.textContent=m;e.style.display="block"}' +
    'function showOk(m){hideMsg();var e=document.getElementById("okMsg");e.textContent=m;e.style.display="block"}' +
    'function hideMsg(){' +
      'document.getElementById("errMsg").style.display="none";' +
      'document.getElementById("okMsg").style.display="none";' +
    '}' +
    '</script>';
}

// ── 選單與對話框 ──

function onOpen(): void {
  SpreadsheetApp.getUi()
    .createMenu('ShortYou')
    .addItem('新增用戶', 'showIssueClientDialog')
    .addSeparator()
    .addItem('停用用戶', 'showDisableClientDialog')
    .addItem('重置用戶 Token', 'showRotateClientTokenDialog')
    .addToUi();
}

function showIssueClientDialog(): void {
  const html = HtmlService.createHtmlOutput(issueDialogHtml_())
    .setWidth(460)
    .setHeight(560);
  SpreadsheetApp.getUi().showModalDialog(html, '新增用戶');
}

/**
 * 由 dialog 呼叫：建立 client + 可選寄信。
 * force=false 時，若 owner 已有 active client 則拒絕。
 */
function issueClientFromDialog(
  ownerName: string,
  ownerEmail: string,
  dailyQuota: number,
  expiresAtIso: string,
  note: string,
  force: boolean
): ApiResult & { emailSent?: boolean } {
  const name = InputNormalizer.text(ownerName);
  if (!name) return { success: false, result: '', error: 'Owner name is required.' };

  const email = InputNormalizer.text(ownerEmail);
  if (!email || !email.includes('@')) return { success: false, result: '', error: 'Valid email is required.' };

  if (!force) {
    const config = AppConfig.load();
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(config.clientsSheetName);
    if (sheet) {
      const lastRow = sheet.getLastRow();
      if (lastRow >= 2) {
        const data = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
        for (let i = 0; i < data.length; i++) {
          const rowOwner = InputNormalizer.text(data[i][1]);
          const rowStatus = InputNormalizer.status(data[i][3]);
          if (rowOwner === name && rowStatus === 'active') {
            const existingCode = InputNormalizer.text(data[i][0]);
            return {
              success: false,
              result: '',
              error: `Owner "${name}" already has active client (${existingCode}). Check "Force" to create anyway, or use Rotate.`
            };
          }
        }
      }
    }
  }

  const { repository } = buildRuntimeContext_();
  const result = repository.withScriptLock(() =>
    repository.issueCapabilityLink(name, expiresAtIso, dailyQuota, note, email)
  );

  if (!result.success || !result.result) return result;

  const capabilityLink = result.result;
  const subject = 'Your ShortYou access link';
  const body = [
    'Hi ' + name + ',',
    '',
    'Your ShortYou capability link is ready:',
    capabilityLink,
    '',
    'Open this link to enter Authorized mode and start creating short links.',
    '',
    'Daily quota: ' + (dailyQuota || 'unlimited'),
    expiresAtIso ? 'Expires: ' + expiresAtIso : 'No expiration set.',
    '',
    'This link contains your personal access token — do not share it publicly.',
    '',
    '— ShortYou Admin'
  ].join('\n');

  try {
    GmailApp.sendEmail(email, subject, body);
  } catch (e: any) {
    return { success: false, result: '', error: 'Email send failed: ' + (e.message || e) };
  }

  Logger.log(JSON.stringify({ ...result, emailSent: true }));
  return { ...result, emailSent: true };
}

// ── Client 選擇器共用 ──

type ActiveClient = { code: string; owner: string; hint: string; email: string };

/**
 * 取得所有 active clients 作為下拉選單選項。
 * 同時嘗試從游標所在列自動偵測 client_code。
 */
function getActiveClientsForPicker_(): { clients: ActiveClient[]; selectedCode: string } {
  const config = AppConfig.load();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(config.clientsSheetName);
  const clients: ActiveClient[] = [];
  let selectedCode = '';

  if (!sheet) return { clients, selectedCode };

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { clients, selectedCode };

  // columns: code(1), owner(2), email(3), status(4), token_hash(5), token_hint(6)
  const data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
  for (let i = 0; i < data.length; i++) {
    const status = InputNormalizer.status(data[i][3]);
    if (status === 'active') {
      clients.push({
        code: InputNormalizer.text(data[i][0]),
        owner: InputNormalizer.text(data[i][1]),
        email: InputNormalizer.text(data[i][2]),
        hint: InputNormalizer.text(data[i][5])
      });
    }
  }

  // 自動偵測：如果游標在 clients sheet 上，抓該列的 client_code
  const activeSheet = ss.getActiveSheet();
  if (activeSheet.getName() === config.clientsSheetName) {
    const activeRow = ss.getActiveCell()?.getRow() || 0;
    if (activeRow >= 2) {
      const code = InputNormalizer.text(sheet.getRange(activeRow, 1).getValue());
      if (code) selectedCode = code;
    }
  }

  return { clients, selectedCode };
}

function clientPickerDialogHtml_(action: string, title: string, btnLabel: string, btnColor: string): string {
  const { clients, selectedCode } = getActiveClientsForPicker_();

  if (clients.length === 0) {
    return '<style>' + css_() + '</style>' +
      '<p style="padding:20px;color:var(--md-on-surface-variant);">No active clients found.</p>' +
      '<div class="actions">' +
        '<button class="btn btn-text" onclick="google.script.host.close()">Close</button>' +
      '</div>';
  }

  let options = '';
  for (const c of clients) {
    const sel = c.code === selectedCode ? ' selected' : '';
    const label = c.owner + ' (' + c.code + ')' + (c.hint ? ' — ' + c.hint : '');
    options += '<option value="' + c.code + '"' + sel + '>' + label + '</option>';
  }

  return '<style>' + css_() +
    '.select-wrap{position:relative}' +
    '.field-select{' +
      'width:100%;height:42px;padding:10px 14px;font-size:14px;font-family:inherit;' +
      'color:var(--md-on-surface);background:var(--md-surface);' +
      'border:1px solid var(--md-outline-variant);border-radius:var(--md-radius-sm);' +
      'outline:none;cursor:pointer;appearance:none;' +
      'background-image:url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'8\' viewBox=\'0 0 12 8\'%3E%3Cpath d=\'M1 1l5 5 5-5\' stroke=\'%23747775\' stroke-width=\'1.5\' fill=\'none\' stroke-linecap=\'round\' stroke-linejoin=\'round\'/%3E%3C/svg%3E");' +
      'background-repeat:no-repeat;background-position:right 14px center;padding-right:36px;' +
    '}' +
    '.field-select:focus{border-color:var(--md-primary);box-shadow:0 0 0 1px var(--md-primary)}' +
    '.client-info{margin-top:12px;padding:12px 14px;background:var(--md-surface-container);border-radius:var(--md-radius-sm);font-size:13px;color:var(--md-on-surface-variant);line-height:1.6;display:none}' +
    '.client-info .label{font-size:11px;font-weight:500;color:var(--md-outline);text-transform:uppercase;letter-spacing:0.05em}' +
    '</style>' +

    '<div class="field">' +
      '<label class="field-label">Select Client</label>' +
      '<select class="field-select" id="clientSelect">' + options + '</select>' +
    '</div>' +

    '<div class="client-info" id="clientInfo"></div>' +

    '<div class="msg error" id="errMsg"></div>' +
    '<div class="msg success" id="okMsg"></div>' +

    '<div class="actions">' +
      '<button class="btn btn-text" id="cancelBtn">Cancel</button>' +
      '<button class="btn btn-primary" id="submitBtn" style="background:' + btnColor + '">' + btnLabel + '</button>' +
    '</div>' +

    '<script>' +
    'var clients=' + JSON.stringify(clients) + ';' +
    'var action="' + action + '";' +

    'document.getElementById("cancelBtn").addEventListener("click",function(){google.script.host.close()});' +
    'document.getElementById("submitBtn").addEventListener("click",onSubmit);' +
    'document.getElementById("clientSelect").addEventListener("change",showInfo);' +
    'showInfo();' +

    'function showInfo(){' +
      'var code=document.getElementById("clientSelect").value;' +
      'var c=clients.find(function(x){return x.code===code});' +
      'var el=document.getElementById("clientInfo");' +
      'if(!c){el.style.display="none";return}' +
      'el.innerHTML=' +
        '"<div><span class=\\"label\\">Owner</span><br>"+c.owner+"</div>"+' +
        '"<div style=\\"margin-top:6px\\"><span class=\\"label\\">Code</span><br>"+c.code+"</div>"+' +
        '(c.hint?"<div style=\\"margin-top:6px\\"><span class=\\"label\\">Token Hint</span><br>"+c.hint+"</div>":"")+' +
        '(c.email?"<div style=\\"margin-top:6px\\"><span class=\\"label\\">Email</span><br>"+c.email+"</div>":"");' +
      'el.style.display="block";' +
    '}' +

    'function onSubmit(){' +
      'var code=document.getElementById("clientSelect").value;' +
      'if(!code){showErr("Please select a client.");return}' +
      'setLoading(true);' +
      'google.script.run' +
        '.withSuccessHandler(onResult)' +
        '.withFailureHandler(onFail)' +
        '[action](code);' +
    '}' +

    'function onResult(r){' +
      'if(!r){onFail({message:"No response"});return}' +
      'if(!r.success){setLoading(false);showErr(r.error||"Unknown error");return}' +
      'if(action==="rotateClientToken"&&r.result){' +
        'showOk("Token rotated! New link copied to clipboard.");' +
        'try{' +
          'var ta=document.createElement("textarea");ta.value=r.result;' +
          'document.body.appendChild(ta);ta.select();document.execCommand("copy");' +
          'document.body.removeChild(ta);' +
        '}catch(e){}' +
        'setTimeout(function(){google.script.host.close()},2500);' +
      '}else{' +
        'showOk("Done!");' +
        'setTimeout(function(){google.script.host.close()},1500);' +
      '}' +
    '}' +

    'function onFail(e){setLoading(false);showErr(e.message||"Script error")}' +

    'function setLoading(on){' +
      'var b=document.getElementById("submitBtn");' +
      'b.disabled=on;b.textContent=on?"Processing...":"' + btnLabel + '";' +
    '}' +

    'function showErr(m){hideMsg();var e=document.getElementById("errMsg");e.textContent=m;e.style.display="block"}' +
    'function showOk(m){hideMsg();var e=document.getElementById("okMsg");e.textContent=m;e.style.display="block"}' +
    'function hideMsg(){document.getElementById("errMsg").style.display="none";document.getElementById("okMsg").style.display="none"}' +
    '</script>';
}

function showDisableClientDialog(): void {
  const html = HtmlService.createHtmlOutput(
    clientPickerDialogHtml_('disableClient', 'Disable Client', 'Disable', '#b3261e')
  )
    .setWidth(420)
    .setHeight(380);
  SpreadsheetApp.getUi().showModalDialog(html, '停用用戶');
}

function rotateDialogHtml_(): string {
  const { clients, selectedCode } = getActiveClientsForPicker_();

  if (clients.length === 0) {
    return '<style>' + css_() + '</style>' +
      '<p style="padding:20px;color:var(--md-on-surface-variant);">No active clients found.</p>' +
      '<div class="actions">' +
        '<button class="btn btn-text" onclick="google.script.host.close()">Close</button>' +
      '</div>';
  }

  let options = '';
  for (const c of clients) {
    const sel = c.code === selectedCode ? ' selected' : '';
    const label = c.owner + ' (' + c.code + ')' + (c.hint ? ' — ' + c.hint : '');
    options += '<option value="' + c.code + '"' + sel + '>' + label + '</option>';
  }

  return '<style>' + css_() +
    '.select-wrap{position:relative}' +
    '.field-select{' +
      'width:100%;height:42px;padding:10px 14px;font-size:14px;font-family:inherit;' +
      'color:var(--md-on-surface);background:var(--md-surface);' +
      'border:1px solid var(--md-outline-variant);border-radius:var(--md-radius-sm);' +
      'outline:none;cursor:pointer;appearance:none;' +
      'background-image:url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'8\' viewBox=\'0 0 12 8\'%3E%3Cpath d=\'M1 1l5 5 5-5\' stroke=\'%23747775\' stroke-width=\'1.5\' fill=\'none\' stroke-linecap=\'round\' stroke-linejoin=\'round\'/%3E%3C/svg%3E");' +
      'background-repeat:no-repeat;background-position:right 14px center;padding-right:36px;' +
    '}' +
    '.field-select:focus{border-color:var(--md-primary);box-shadow:0 0 0 1px var(--md-primary)}' +
    '.client-info{margin-top:12px;padding:12px 14px;background:var(--md-surface-container);border-radius:var(--md-radius-sm);font-size:13px;color:var(--md-on-surface-variant);line-height:1.6;display:none}' +
    '.client-info .label{font-size:11px;font-weight:500;color:var(--md-outline);text-transform:uppercase;letter-spacing:0.05em}' +
    '</style>' +

    '<div class="field">' +
      '<label class="field-label">Select Client</label>' +
      '<select class="field-select" id="clientSelect">' + options + '</select>' +
    '</div>' +

    '<div class="client-info" id="clientInfo"></div>' +

    '<div class="msg error" id="errMsg"></div>' +
    '<div class="msg success" id="okMsg"></div>' +

    '<div class="actions">' +
      '<button class="btn btn-text" id="cancelBtn">Cancel</button>' +
      '<button class="btn btn-primary" id="submitBtn">Rotate</button>' +
    '</div>' +

    '<script>' +
    'var clients=' + JSON.stringify(clients) + ';' +

    'document.getElementById("cancelBtn").addEventListener("click",function(){google.script.host.close()});' +
    'document.getElementById("submitBtn").addEventListener("click",onSubmit);' +
    'document.getElementById("clientSelect").addEventListener("change",showInfo);' +
    'showInfo();' +

    'function showInfo(){' +
      'var code=document.getElementById("clientSelect").value;' +
      'var c=clients.find(function(x){return x.code===code});' +
      'var el=document.getElementById("clientInfo");' +
      'if(!c){el.style.display="none";return}' +
      'el.innerHTML=' +
        '"<div><span class=\\"label\\">Owner</span><br>"+c.owner+"</div>"+' +
        '"<div style=\\"margin-top:6px\\"><span class=\\"label\\">Code</span><br>"+c.code+"</div>"+' +
        '(c.hint?"<div style=\\"margin-top:6px\\"><span class=\\"label\\">Token Hint</span><br>"+c.hint+"</div>":"")+' +
        '(c.email?"<div style=\\"margin-top:6px\\"><span class=\\"label\\">Email</span><br>"+c.email+"</div>":"<div style=\\"margin-top:6px;color:var(--md-error)\\"><span class=\\"label\\">⚠ Email</span><br>Not set — rotation will be blocked</div>");' +
      'el.style.display="block";' +
    '}' +

    'function onSubmit(){' +
      'var code=document.getElementById("clientSelect").value;' +
      'if(!code){showErr("Please select a client.");return}' +
      'setLoading(true);' +
      'google.script.run' +
        '.withSuccessHandler(onResult)' +
        '.withFailureHandler(onFail)' +
        '.rotateClientTokenFromDialog(code);' +
    '}' +

    'function onResult(r){' +
      'if(!r){onFail({message:"No response"});return}' +
      'if(!r.success){setLoading(false);showErr(r.error||"Unknown error");return}' +
      'var m="Token rotated!";' +
      'if(r.emailSent)m+=" New link sent via email.";' +
      'showOk(m);' +
      'setTimeout(function(){google.script.host.close()},2000);' +
    '}' +

    'function onFail(e){setLoading(false);showErr(e.message||"Script error")}' +

    'function setLoading(on){' +
      'var b=document.getElementById("submitBtn");' +
      'b.disabled=on;b.textContent=on?"Rotating...":"Rotate";' +
    '}' +

    'function showErr(m){hideMsg();var e=document.getElementById("errMsg");e.textContent=m;e.style.display="block"}' +
    'function showOk(m){hideMsg();var e=document.getElementById("okMsg");e.textContent=m;e.style.display="block"}' +
    'function hideMsg(){document.getElementById("errMsg").style.display="none";document.getElementById("okMsg").style.display="none"}' +
    '</script>';
}

function showRotateClientTokenDialog(): void {
  const html = HtmlService.createHtmlOutput(rotateDialogHtml_())
    .setWidth(420)
    .setHeight(440);
  SpreadsheetApp.getUi().showModalDialog(html, '重置用戶 Token');
}

/**
 * 由 Rotate dialog 呼叫：重置 token + 寄信通知。
 * email 從 clients sheet 直接讀取，無 email 則拒絕操作。
 */
function rotateClientTokenFromDialog(
  clientCode: string
): ApiResult & { emailSent?: boolean } {
  const normalizedCode = InputNormalizer.text(clientCode);
  if (!normalizedCode) return { success: false, result: '', error: 'missing_client_code' };

  // 先檢查 email 是否存在，沒有就擋住
  const config = AppConfig.load();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(config.clientsSheetName);
  if (!sheet) return { success: false, result: '', error: 'clients sheet not found' };

  const { repository } = buildRuntimeContext_();
  const result = repository.withScriptLock(() => repository.rotateClientToken(normalizedCode));

  if (!result.success || !result.result) return result;

  const resultEmail = String(result.email || '');
  const resultOwner = String(result.ownerName || normalizedCode);

  if (!resultEmail || !resultEmail.includes('@')) {
    return { success: false, result: '', error: 'This client has no email on record. Please add email to the Sheet first.' };
  }

  const subject = 'Your ShortYou access link has been rotated';
  const body = [
    'Hi ' + resultOwner + ',',
    '',
    'Your ShortYou capability link has been rotated. The old link is no longer valid.',
    '',
    'New link:',
    result.result,
    '',
    'Open this link to enter Authorized mode and start creating short links.',
    '',
    'This link contains your personal access token — do not share it publicly.',
    '',
    '— ShortYou Admin'
  ].join('\n');

  try {
    GmailApp.sendEmail(resultEmail, subject, body);
  } catch (e: any) {
    return { success: false, result: '', error: 'Token rotated but email failed: ' + (e.message || e) };
  }

  Logger.log(JSON.stringify({ clientCode: normalizedCode, rotated: true, emailSent: true }));
  return { ...result, emailSent: true };
}
