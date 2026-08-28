using System.Collections.Generic;

// Mirrors $script:Sessions (sessionId -> {type, loggedBy, startedAt, and a
// few optional fields set mid-session like fishingStartSkill}). Dynamic-bag
// style (Dictionary<string,object> per session), matching the PS hashtable's
// own loose extensibility rather than a fixed-shape class.
internal static class SessionState
{
    private static readonly Dictionary<string, Dictionary<string, object>> Sessions =
        new Dictionary<string, Dictionary<string, object>>();

    public static void Start(string sessionId, Dictionary<string, object> info)
    {
        Sessions[sessionId] = info;
    }

    public static Dictionary<string, object> Get(string sessionId)
    {
        Dictionary<string, object> info;
        return Sessions.TryGetValue(sessionId, out info) ? info : null;
    }

    public static bool Exists(string sessionId)
    {
        return Sessions.ContainsKey(sessionId);
    }

    public static void End(string sessionId)
    {
        Sessions.Remove(sessionId);
    }
}
