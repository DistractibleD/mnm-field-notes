using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Web.Script.Serialization;

// Wraps JavaScriptSerializer rather than DataContractJsonSerializer - the
// app treats JSON as loose dynamic dictionaries throughout (logEntry
// explicitly stores "whatever fields the JS sent", GatherNotes/Profiles are
// plain key-value bags), which is exactly what DeserializeObject returns
// (Dictionary<string,object> / ArrayList / primitives) - a near 1:1 match
// for what PS's ConvertFrom-Json effectively gave the old host.
internal static class JsonUtil
{
    private static readonly JavaScriptSerializer Serializer = CreateSerializer();

    private static JavaScriptSerializer CreateSerializer()
    {
        var s = new JavaScriptSerializer();
        // Default MaxJsonLength (~2MB) could plausibly be hit by
        // monsters.json/items.json as the wiki grows - raise it generously.
        // NOT int.MaxValue: JavaScriptSerializer's internal buffer-size math
        // silently breaks (empty results, no exception) at that extreme -
        // confirmed by testing against the real wiki JSON. 50,000,000 chars
        // is ~75x today's largest file (items.json, ~659K chars) with room
        // to spare, safely below whatever internal ceiling causes the bug.
        s.MaxJsonLength = 50000000;
        s.RecursionLimit = 1000;
        return s;
    }

    public static string Serialize(object value)
    {
        return Serializer.Serialize(value);
    }

    public static object Deserialize(string json)
    {
        return Serializer.DeserializeObject(json);
    }

    public static Dictionary<string, object> DeserializeObjectMap(string json)
    {
        return Deserialize(json) as Dictionary<string, object>;
    }

    // JavaScriptSerializer.DeserializeObject represents a JSON array as
    // object[] on this .NET Framework build (confirmed by tracing the actual
    // runtime type against real data) - NOT ArrayList, despite that being
    // the more commonly-documented/assumed return type. Checking only
    // ArrayList silently produces an empty list with no exception at all for
    // every array value (top-level or nested inside an object, e.g. a
    // monster's "drops"/"maps"/"areas" fields) - a real bug that's easy to
    // reintroduce, so every array read in this codebase should go through
    // this helper rather than casting directly.
    public static List<object> AsObjectList(object value)
    {
        var arrayList = value as ArrayList;
        if (arrayList != null) return arrayList.Cast<object>().ToList();
        var objectArray = value as object[];
        if (objectArray != null) return objectArray.ToList();
        var list = value as List<object>;
        if (list != null) return list;
        return new List<object>();
    }
}
