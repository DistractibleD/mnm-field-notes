using System;
using System.IO;
using System.Net;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Windows.Forms;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        try
        {
            // Must be registered before ANY WebView2 type is touched anywhere
            // in the process. Deliberately kept in a method with no WebView2
            // type references at all - the JIT resolves every type a method
            // body touches before running any of that method's statements,
            // so registering the resolver and using a WebView2 type in the
            // SAME method doesn't work even if the registration line comes
            // first textually. LaunchApp() (NoInlining, so it can't get
            // merged back into this method by the optimizer) is where
            // WebView2 types actually get touched, in a separate JIT unit
            // that only compiles once this line has already run.
            AppDomain.CurrentDomain.AssemblyResolve += ResolveWebView2Assembly;
            LaunchApp();
        }
        catch (Exception ex)
        {
            try
            {
                File.WriteAllText(
                    Path.Combine(AppPaths.Root, "crash.txt"), ex.ToString());
            }
            catch { /* never let crash reporting itself crash */ }
            throw;
        }
    }

    [MethodImpl(MethodImplOptions.NoInlining)]
    private static void LaunchApp()
    {
        // Tells the WebView2 SDK where the NATIVE WebView2Loader.dll lives -
        // a separate concern from the managed-assembly resolve above (native
        // DLL loading doesn't go through AppDomain.AssemblyResolve at all),
        // and without it the native loader wouldn't be found since it
        // doesn't sit next to the exe. Same call the old PS1 host made.
        Microsoft.Web.WebView2.Core.CoreWebView2Environment.SetLoaderDllFolderPath(AppPaths.WebView2Root);

        ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);

        AppPaths.EnsureDataDirsExist();

        try
        {
            AppIdentity.SetCurrentProcessExplicitAppUserModelID("DistractibleD.MnMFieldNotes");
        }
        catch
        {
            // Never let a taskbar-identity nicety block the app from starting.
        }

        Application.ThreadException += (s, e) =>
        {
            DebugLog.Write("ThreadException", e.Exception.ToString());
            if (Environment.GetEnvironmentVariable("SV_AUTOTEST") != "1")
            {
                MessageBox.Show(
                    "Something went wrong and that last action may not have saved. You can keep using the app - if this keeps happening, check Data\\error.log.",
                    "MnM Field Notes");
            }
        };

        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new MainForm());
    }

    private static Assembly ResolveWebView2Assembly(object sender, ResolveEventArgs args)
    {
        string simpleName = new AssemblyName(args.Name).Name;
        if (simpleName != "Microsoft.Web.WebView2.Core" && simpleName != "Microsoft.Web.WebView2.WinForms")
        {
            return null;
        }
        string path = Path.Combine(AppPaths.WebView2Root, simpleName + ".dll");
        return File.Exists(path) ? Assembly.LoadFrom(path) : null;
    }
}
