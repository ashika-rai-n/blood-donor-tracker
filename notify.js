(function(){
  const statusEl = document.getElementById('notifications-status');
  const listEl = document.getElementById('notifications-list');
  const tpl = document.getElementById('notification-row-template');
  const refreshBtn = document.getElementById('notifications-refresh');
  let polling = null;

  function setStatus(msg, isError) {
    statusEl.textContent = msg || '';
    statusEl.style.color = isError ? '#c0392b' : '#555';
  }

  function renderRows(rows) {
    listEl.innerHTML = '';
    if (!rows || rows.length === 0) {
      listEl.innerHTML = '<p style="color:#666;">No messages yet.</p>';
      return;
    }

    rows.forEach(r => {
      const node = tpl.content.cloneNode(true);
      const container = node.querySelector('.notification-row');
      const nameEl = node.querySelector('.notif-donor-name');
      const fromEl = node.querySelector('.notif-from');
      const timeEl = node.querySelector('.notif-time');
      const bodyEl = node.querySelector('.notif-body');
      const dirEl = node.querySelector('.notif-direction');
      const toEl = node.querySelector('.notif-to');

      nameEl.textContent = r.donorName ? `${r.donorName} (ID:${r.donorId})` : 'Unknown Donor';
      fromEl.textContent = r.fromNumber || '';
      timeEl.textContent = (new Date(r.createdAt)).toLocaleString();
      bodyEl.textContent = r.body || '';
      dirEl.textContent = r.direction || '';
      toEl.textContent = r.toNumber || '';

      listEl.appendChild(node);
    });
  }

  async function fetchMessages() {
    setStatus('Loading messages...');
    try {
      const res = await fetch('/api/messages');
      if (!res.ok) {
        const txt = await res.text().catch(()=>null);
        setStatus('Failed to load messages: ' + (res.status + ' ' + res.statusText), true);
        listEl.innerHTML = '<p style="color:#c0392b;">Could not load messages. Ensure the server provides <code>/api/messages</code>.</p>';
        return;
      }
      const data = await res.json();
      renderRows(data);
      setStatus('Last updated: ' + new Date().toLocaleTimeString());
    } catch (err) {
      console.error('Error fetching messages:', err);
      setStatus('Error loading messages: ' + (err.message || err), true);
      listEl.innerHTML = '<p style="color:#c0392b;">Error loading messages. Check server console.</p>';
    }
  }

  function startPolling() {
    if (polling) return;
    polling = setInterval(fetchMessages, 15000);
  }
  function stopPolling() {
    if (!polling) return;
    clearInterval(polling);
    polling = null;
  }

  refreshBtn.addEventListener('click', () => {
    fetchMessages();
  });

  // init
  fetchMessages();
  startPolling();

  // stop polling when fragment hidden (optional)
  window.addEventListener('visibilitychange', () => {
    if (document.hidden) stopPolling(); else startPolling();
  });

})();
