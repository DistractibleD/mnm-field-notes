using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Windows.Forms;

// Mirrors Start-KeyHook/Stop-KeyHook/the poll timer in the old
// MnMFieldNotes.ps1. The delegate-GC-rooting requirement is a P/Invoke
// marshaling fundamental (not a PowerShell artifact) and carries over
// unchanged: _delegate must stay a live instance field for as long as the
// native hook holds a pointer to its thunk.
internal sealed class KeyHookTarget
{
    public int VkCode;
    public bool Ctrl;
    public bool Alt;
    public bool Shift;
}

internal sealed class KeyHookController
{
    private readonly UiBridge _ui;
    private readonly object _lock = new object();
    private readonly Timer _pollTimer;

    private IntPtr _handle = IntPtr.Zero;
    private KeyHookNative.HookProc _delegate;
    private string _mode = "idle"; // idle | capture | count
    private KeyHookTarget _target;
    private KeyHookTarget _capturedPending;
    private int _countPending;

    public KeyHookController(UiBridge ui)
    {
        _ui = ui;
        // Polls at a fast-enough interval that a fishing cadence (at most a
        // couple of presses per second) never feels laggy, without doing
        // any work on ticks where nothing changed.
        _pollTimer = new Timer { Interval = 50 };
        _pollTimer.Tick += PollTick;
        _pollTimer.Start();
    }

    public void Stop()
    {
        if (_handle != IntPtr.Zero)
        {
            KeyHookNative.UnhookWindowsHookEx(_handle);
            _handle = IntPtr.Zero;
        }
        _mode = "idle";
        _target = null;
    }

    public void Start(string mode, KeyHookTarget target)
    {
        Stop();
        _mode = mode;
        _target = target;
        lock (_lock) { _capturedPending = null; _countPending = 0; }

        // Must be an instance field, not a local - a local delegate would be
        // eligible for GC as soon as this method returns, while the native
        // hook still holds a pointer to its thunk. That's exactly the kind
        // of bug that only shows up intermittently once the GC actually runs.
        _delegate = HookCallback;
        _handle = KeyHookNative.SetWindowsHookEx(KeyHookNative.WH_KEYBOARD_LL, _delegate, IntPtr.Zero, 0);
    }

    // The hook callback itself does the absolute minimum - flip a flag / bump
    // a counter, nothing else. It never calls UiBridge.Send (WebView2 IPC),
    // never calls Stop(), never does anything that could re-enter WinForms/
    // COM from inside a native callback. The separate polling Timer below
    // (on the normal message loop, never inside the hook's own call stack)
    // is what actually reacts. Two reasons, carried over from the PS1
    // version verbatim: (1) reentrant calls across a native callback
    // boundary are fragile and caused a real crash during that version's
    // testing; (2) Windows can silently uninstall a low-level hook whose
    // callback is slow or does too much work - keeping it trivial avoids
    // that entirely.
    private IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam)
    {
        try
        {
            int wp = wParam.ToInt32();
            if (nCode >= 0 && (wp == KeyHookNative.WM_KEYDOWN || wp == KeyHookNative.WM_SYSKEYDOWN))
            {
                int vkCode = Marshal.ReadInt32(lParam);
                bool ctrl = (KeyHookNative.GetAsyncKeyState(KeyHookNative.VK_CONTROL) & 0x8000) != 0;
                bool alt = (KeyHookNative.GetAsyncKeyState(KeyHookNative.VK_MENU) & 0x8000) != 0;
                bool shift = (KeyHookNative.GetAsyncKeyState(KeyHookNative.VK_SHIFT) & 0x8000) != 0;
                bool isModifierKey = vkCode == 0x10 || vkCode == 0x11 || vkCode == 0x12
                    || vkCode == 0xA0 || vkCode == 0xA1 || vkCode == 0xA2 || vkCode == 0xA3 || vkCode == 0xA4 || vkCode == 0xA5;

                lock (_lock)
                {
                    if (_mode == "capture" && !isModifierKey && _capturedPending == null)
                    {
                        _capturedPending = new KeyHookTarget { VkCode = vkCode, Ctrl = ctrl, Alt = alt, Shift = shift };
                    }
                    else if (_mode == "count")
                    {
                        var t = _target;
                        if (t != null && vkCode == t.VkCode && ctrl == t.Ctrl && alt == t.Alt && shift == t.Shift)
                        {
                            _countPending++;
                        }
                    }
                }
            }
        }
        catch
        {
            // Never let a hook callback throw back into the OS message loop.
        }
        return KeyHookNative.CallNextHookEx(IntPtr.Zero, nCode, wParam, lParam);
    }

    private void PollTick(object sender, EventArgs e)
    {
        try
        {
            KeyHookTarget captured = null;
            int countToSend;
            lock (_lock)
            {
                if (_capturedPending != null) { captured = _capturedPending; _capturedPending = null; }
                countToSend = _countPending;
                _countPending = 0;
            }

            if (captured != null)
            {
                string label = GetKeyLabel(captured.VkCode, captured.Ctrl, captured.Alt, captured.Shift);
                Stop();
                _ui.Send(new Dictionary<string, object>
                {
                    { "type", "keyCaptured" }, { "vkCode", captured.VkCode }, { "ctrl", captured.Ctrl },
                    { "alt", captured.Alt }, { "shift", captured.Shift }, { "label", label },
                });
            }
            for (int i = 0; i < countToSend; i++)
            {
                _ui.Send(new Dictionary<string, object> { { "type", "keyCounted" } });
            }
        }
        catch (Exception ex)
        {
            DebugLog.Write("KeyHookPollTimer", ex.ToString());
        }
    }

    private static string GetKeyLabel(int vkCode, bool ctrl, bool alt, bool shift)
    {
        string keyName;
        if (vkCode >= 0x30 && vkCode <= 0x39) keyName = ((char)vkCode).ToString();
        else if (vkCode >= 0x41 && vkCode <= 0x5A) keyName = ((char)vkCode).ToString();
        else if (vkCode >= 0x70 && vkCode <= 0x87) keyName = "F" + (vkCode - 0x6F);
        else keyName = "Key" + vkCode;

        var mods = new List<string>();
        if (ctrl) mods.Add("Ctrl");
        if (alt) mods.Add("Alt");
        if (shift) mods.Add("Shift");
        return mods.Count > 0 ? string.Join("+", mods) + "+" + keyName : keyName;
    }
}
