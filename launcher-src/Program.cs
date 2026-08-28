using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Net.Http;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace InvokeAILauncher
{
    internal static class Program
    {
        [STAThread]
        private static void Main()
        {
            using (var mutex = new Mutex(false, "Local\\InvokeAISimpleModeLauncher"))
            {
                if (!mutex.WaitOne(0, false))
                {
                    MessageBox.Show("InvokeAI Launcher is already running.", "InvokeAI", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }

                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new LauncherForm());
            }
        }
    }

    internal sealed class LauncherForm : Form
    {
        private readonly string root;
        private readonly string url = "http://127.0.0.1:9090";
        private readonly string simpleUrl = "http://127.0.0.1:9091";
        private readonly string hiDreamUrl = "http://127.0.0.1:7860";
        private readonly HttpClient httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(2) };
        private readonly Label statusLabel = new Label();
        private readonly DotControl statusDot = new DotControl();
        private readonly RoundedPanel statusPill = new RoundedPanel();
        private readonly TextBox logBox = new TextBox();
        private readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer();
        private Process serverProcess;
        private Process simpleModeProcess;
        private Process hiDreamProcess;
        private bool browserOpened;
        private bool hiDreamBrowserOpened;
        private bool timerBusy;

        public LauncherForm()
        {
            root = Environment.GetEnvironmentVariable("INVOKEAI_ROOT");
            if (string.IsNullOrWhiteSpace(root))
            {
                root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "invokeai");
            }

            var iconPath = Path.Combine(root, "launcher", "InvokeAI.ico");
            if (File.Exists(iconPath))
            {
                Icon = new Icon(iconPath);
            }

            Text = "InvokeAI Simple Mode 1.0";
            ClientSize = new Size(820, 460);
            MinimumSize = new Size(740, 390);
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Color.FromArgb(8, 11, 16);
            ForeColor = Color.FromArgb(236, 242, 247);
            Font = new Font("Segoe UI", 9F);

            var accentBar = new Panel();
            accentBar.BackColor = Color.FromArgb(221, 255, 39);
            accentBar.Dock = DockStyle.Top;
            accentBar.Height = 4;
            Controls.Add(accentBar);

            var logoPanel = new RoundedPanel();
            logoPanel.Radius = 18;
            logoPanel.BackColor = Color.FromArgb(221, 255, 39);
            logoPanel.BorderColor = Color.FromArgb(221, 255, 39);
            logoPanel.Location = new Point(28, 30);
            logoPanel.Size = new Size(76, 76);
            Controls.Add(logoPanel);

            var logo = new PictureBox();
            logo.BackColor = Color.FromArgb(221, 255, 39);
            logo.SizeMode = PictureBoxSizeMode.Zoom;
            logo.Location = new Point(10, 10);
            logo.Size = new Size(56, 56);
            logo.Image = LoadLogoImage();
            logoPanel.Controls.Add(logo);

            var titleLabel = new Label();
            titleLabel.Text = "InvokeAI Simple Mode";
            titleLabel.Font = new Font("Segoe UI Semibold", 25F, FontStyle.Bold);
            titleLabel.ForeColor = Color.FromArgb(248, 251, 252);
            titleLabel.AutoSize = true;
            titleLabel.Location = new Point(124, 30);
            Controls.Add(titleLabel);

            var subtitleLabel = new Label();
            subtitleLabel.Text = "Community node canvas | v1.1.0";
            subtitleLabel.Font = new Font("Segoe UI", 10F);
            subtitleLabel.ForeColor = Color.FromArgb(150, 164, 178);
            subtitleLabel.AutoSize = true;
            subtitleLabel.Location = new Point(130, 74);
            Controls.Add(subtitleLabel);

            statusPill.Radius = 18;
            statusPill.BackColor = Color.FromArgb(18, 25, 34);
            statusPill.BorderColor = Color.FromArgb(36, 48, 60);
            statusPill.Size = new Size(196, 40);
            statusPill.Location = new Point(ClientSize.Width - statusPill.Width - 28, 38);
            statusPill.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            Controls.Add(statusPill);

            statusDot.Location = new Point(16, 14);
            statusDot.Size = new Size(12, 12);
            statusDot.DotColor = Color.FromArgb(150, 164, 178);
            statusPill.Controls.Add(statusDot);

            statusLabel.Text = "Status wird geprueft...";
            statusLabel.Font = new Font("Segoe UI Semibold", 9F, FontStyle.Bold);
            statusLabel.ForeColor = Color.FromArgb(220, 228, 236);
            statusLabel.AutoSize = true;
            statusLabel.Location = new Point(36, 11);
            statusPill.Controls.Add(statusLabel);

            var buttonY = 132;
            var startButton = CreateButton("Start", 28, buttonY, StartInvoke, true);
            var simpleButton = CreateButton("Simple", 154, buttonY, OpenSimpleMode, false);
            var invokeButton = CreateButton("Invoke", 280, buttonY, OpenInvokeAI, false);
            var hiDreamButton = CreateButton("HiDream", 406, buttonY, StartHiDream, false);
            var stopButton = CreateButton("Stop", 532, buttonY, StopAll, false);
            var closeButton = CreateButton("Close", 658, buttonY, Close, false);

            Controls.Add(startButton);
            Controls.Add(simpleButton);
            Controls.Add(invokeButton);
            Controls.Add(hiDreamButton);
            Controls.Add(stopButton);
            Controls.Add(closeButton);

            var urlLabel = new Label();
            urlLabel.Text = simpleUrl + "  |  Invoke " + url + "  |  HiDream " + hiDreamUrl;
            urlLabel.Font = new Font("Consolas", 9F);
            urlLabel.ForeColor = Color.FromArgb(124, 138, 150);
            urlLabel.AutoSize = true;
            urlLabel.Location = new Point(30, 187);
            Controls.Add(urlLabel);

            var logPanel = new RoundedPanel();
            logPanel.Radius = 16;
            logPanel.BackColor = Color.FromArgb(13, 18, 25);
            logPanel.BorderColor = Color.FromArgb(30, 41, 53);
            logPanel.Location = new Point(28, 218);
            logPanel.Size = new Size(ClientSize.Width - 56, 210);
            logPanel.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
            Controls.Add(logPanel);

            var logTitle = new Label();
            logTitle.Text = "Activity";
            logTitle.Font = new Font("Segoe UI Semibold", 9F, FontStyle.Bold);
            logTitle.ForeColor = Color.FromArgb(172, 185, 198);
            logTitle.AutoSize = true;
            logTitle.Location = new Point(18, 14);
            logPanel.Controls.Add(logTitle);

            logBox.Multiline = true;
            logBox.ScrollBars = ScrollBars.Vertical;
            logBox.ReadOnly = true;
            logBox.WordWrap = false;
            logBox.Font = new Font("Consolas", 9);
            logBox.BorderStyle = BorderStyle.None;
            logBox.BackColor = Color.FromArgb(13, 18, 25);
            logBox.ForeColor = Color.FromArgb(192, 203, 214);
            logBox.Location = new Point(18, 42);
            logBox.Size = new Size(logPanel.Width - 36, 148);
            logBox.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
            logPanel.Controls.Add(logBox);

            timer.Interval = 2000;
            timer.Tick += async delegate { await RefreshStatusAsync(); };

            Shown += async delegate
            {
                timer.Start();
                if (await IsHiDreamReadyAsync())
                {
                    SetStatus("HiDream Running", Color.FromArgb(90, 240, 142));
                }
                else if (await IsServerReadyAsync())
                {
                    StartSimpleMode();
                    SetStatus("Invoke Running", Color.FromArgb(90, 240, 142));
                }
                else
                {
                    StartInvoke();
                }
            };

            FormClosing += delegate
            {
                timer.Stop();
                StopAll();
            };
        }

        private string ServerExe
        {
            get { return Path.Combine(root, ".venv", "Scripts", "invokeai-web.exe"); }
        }

        private string SimpleModeExe
        {
            get { return Path.Combine(root, ".venv", "Scripts", "python.exe"); }
        }

        private string SimpleModeScript
        {
            get { return Path.Combine(root, "simple-mode", "simple_mode_server.py"); }
        }

        private string HiDreamRoot
        {
            get
            {
                var configured = Environment.GetEnvironmentVariable("HIDREAM_ROOT");
                return string.IsNullOrWhiteSpace(configured)
                    ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "hidream-o1")
                    : configured;
            }
        }

        private string HiDreamExe
        {
            get { return Path.Combine(HiDreamRoot, ".venv", "Scripts", "python.exe"); }
        }

        private string HiDreamScript
        {
            get { return Path.Combine(HiDreamRoot, "app.py"); }
        }

        private string HiDreamModelPath
        {
            get { return Path.Combine(HiDreamRoot, "models", "HiDream-O1-Image-Dev-2604"); }
        }

        private string VersionUrl
        {
            get { return url + "/api/v1/app/version"; }
        }

        private string SimpleModePingUrl
        {
            get { return simpleUrl + "/api/ping"; }
        }

        private string QueueStatusUrl
        {
            get { return url + "/api/v1/queue/default/status"; }
        }

        private Image LoadLogoImage()
        {
            var sourcePath = Path.Combine(root, "launcher", "InvokeAI-icon-source.png");
            if (File.Exists(sourcePath))
            {
                using (var source = Image.FromFile(sourcePath))
                {
                    return new Bitmap(source);
                }
            }

            return Icon == null ? null : Icon.ToBitmap();
        }

        private Button CreateButton(string text, int x, int y, Action action, bool primary)
        {
            var button = new ModernButton();
            button.Text = text;
            button.Size = new Size(110, 40);
            button.Location = new Point(x, y);
            button.Font = new Font("Segoe UI Semibold", 9F, FontStyle.Bold);
            button.ForeColor = primary ? Color.FromArgb(5, 8, 10) : Color.FromArgb(228, 235, 241);
            ((ModernButton)button).FillColor = primary ? Color.FromArgb(221, 255, 39) : Color.FromArgb(21, 29, 39);
            ((ModernButton)button).HoverColor = primary ? Color.FromArgb(235, 255, 97) : Color.FromArgb(30, 42, 55);
            ((ModernButton)button).BorderColor = primary ? Color.FromArgb(221, 255, 39) : Color.FromArgb(42, 55, 69);
            button.Click += delegate { action(); };
            return button;
        }

        private async Task RefreshStatusAsync()
        {
            if (timerBusy)
            {
                return;
            }

            timerBusy = true;
            try
            {
                if (await IsHiDreamReadyAsync())
                {
                    SetStatus("HiDream Running", Color.FromArgb(90, 240, 142));
                    if (!hiDreamBrowserOpened)
                    {
                        hiDreamBrowserOpened = true;
                        OpenHiDream();
                    }
                }
                else if ((hiDreamProcess != null && !hiDreamProcess.HasExited) || FindHiDreamProcesses().Count > 0)
                {
                    SetStatus("HiDream Starting", Color.FromArgb(255, 184, 77));
                }
                else if (await IsServerReadyAsync())
                {
                    StartSimpleMode();
                    SetStatus("Invoke Running", Color.FromArgb(90, 240, 142));
                    if (!browserOpened)
                    {
                        if (await IsSimpleModeReadyAsync())
                        {
                            browserOpened = true;
                            OpenSimpleMode();
                        }
                    }
                }
                else if (serverProcess != null && serverProcess.HasExited)
                {
                    SetStatus("Stopped", Color.FromArgb(150, 164, 178));
                }
                else if (FindInvokeProcesses().Count > 0)
                {
                    SetStatus("Starting", Color.FromArgb(255, 184, 77));
                }
                else
                {
                    SetStatus("Stopped", Color.FromArgb(150, 164, 178));
                }
            }
            finally
            {
                timerBusy = false;
            }
        }

        private async Task<bool> IsServerReadyAsync()
        {
            try
            {
                using (var response = await httpClient.GetAsync(VersionUrl))
                {
                    return response.IsSuccessStatusCode;
                }
            }
            catch
            {
                return false;
            }
        }

        private async Task<bool> IsSimpleModeReadyAsync()
        {
            try
            {
                using (var response = await httpClient.GetAsync(SimpleModePingUrl))
                {
                    return response.IsSuccessStatusCode;
                }
            }
            catch
            {
                return false;
            }
        }

        private async Task<bool> IsHiDreamReadyAsync()
        {
            try
            {
                using (var response = await httpClient.GetAsync(hiDreamUrl + "/"))
                {
                    return response.IsSuccessStatusCode;
                }
            }
            catch
            {
                return false;
            }
        }

        private async Task<bool> IsInvokeQueueIdleAsync()
        {
            try
            {
                var json = await httpClient.GetStringAsync(QueueStatusUrl);
                return Regex.IsMatch(json, "\\\"pending\\\"\\s*:\\s*0")
                    && Regex.IsMatch(json, "\\\"in_progress\\\"\\s*:\\s*0");
            }
            catch
            {
                return false;
            }
        }

        private List<Process> FindInvokeProcesses()
        {
            var processes = new List<Process>();
            foreach (var process in Process.GetProcessesByName("invokeai-web"))
            {
                try
                {
                    var module = process.MainModule;
                    var path = module == null ? null : module.FileName;
                    if (!string.IsNullOrWhiteSpace(path) && path.StartsWith(root, StringComparison.OrdinalIgnoreCase))
                    {
                        processes.Add(process);
                    }
                    else
                    {
                        process.Dispose();
                    }
                }
                catch
                {
                    process.Dispose();
                }
            }
            return processes;
        }

        private List<Process> FindHiDreamProcesses()
        {
            var processes = new List<Process>();
            foreach (var processName in new[] { "python", "pythonw" })
            {
                foreach (var process in Process.GetProcessesByName(processName))
                {
                    try
                    {
                        var module = process.MainModule;
                        var path = module == null ? null : module.FileName;
                        if (!string.IsNullOrWhiteSpace(path) && path.StartsWith(HiDreamRoot, StringComparison.OrdinalIgnoreCase))
                        {
                            processes.Add(process);
                        }
                        else
                        {
                            process.Dispose();
                        }
                    }
                    catch
                    {
                        process.Dispose();
                    }
                }
            }
            return processes;
        }

        private void StartInvoke()
        {
            if (Task.Run((Func<Task<bool>>)IsHiDreamReadyAsync).GetAwaiter().GetResult()
                || FindHiDreamProcesses().Count > 0)
            {
                AppendLog("Stopping HiDream before loading InvokeAI.");
                StopHiDream();
                Thread.Sleep(800);
            }

            if (Task.Run((Func<Task<bool>>)IsServerReadyAsync).GetAwaiter().GetResult())
            {
                StartSimpleMode();
                SetStatus("Running", Color.FromArgb(90, 240, 142));
                OpenSimpleMode();
                return;
            }

            if (FindInvokeProcesses().Count > 0)
            {
                SetStatus("Starting", Color.FromArgb(255, 184, 77));
                AppendLog("An existing InvokeAI process was found. Waiting for it to become ready.");
                return;
            }

            if (!File.Exists(ServerExe))
            {
                SetStatus("Missing", Color.FromArgb(255, 93, 115));
                AppendLog("Missing file: " + ServerExe);
                return;
            }

            browserOpened = false;
            var startInfo = new ProcessStartInfo();
            startInfo.FileName = ServerExe;
            startInfo.WorkingDirectory = root;
            startInfo.Arguments = "--root \"" + root + "\"";
            startInfo.UseShellExecute = true;
            startInfo.WindowStyle = ProcessWindowStyle.Hidden;

            try
            {
                serverProcess = new Process();
                serverProcess.StartInfo = startInfo;
                serverProcess.EnableRaisingEvents = true;
                serverProcess.Start();
                StartSimpleMode();
                SetStatus("Starting", Color.FromArgb(255, 184, 77));
                AppendLog("Starting InvokeAI at " + url);
            }
            catch (Exception ex)
            {
                SetStatus("Failed", Color.FromArgb(255, 93, 115));
                AppendLog(ex.Message);
            }
        }

        private void StartHiDream()
        {
            if (Task.Run((Func<Task<bool>>)IsHiDreamReadyAsync).GetAwaiter().GetResult())
            {
                SetStatus("HiDream Running", Color.FromArgb(90, 240, 142));
                OpenHiDream();
                return;
            }

            if (FindHiDreamProcesses().Count > 0)
            {
                SetStatus("HiDream Starting", Color.FromArgb(255, 184, 77));
                AppendLog("An existing HiDream process was found. Waiting for it to become ready.");
                return;
            }

            if (!File.Exists(HiDreamExe) || !File.Exists(HiDreamScript)
                || !File.Exists(Path.Combine(HiDreamModelPath, "model.safetensors.index.json")))
            {
                SetStatus("HiDream Missing", Color.FromArgb(255, 93, 115));
                AppendLog("HiDream installation or model files are missing.");
                return;
            }

            var invokeReady = Task.Run((Func<Task<bool>>)IsServerReadyAsync).GetAwaiter().GetResult();
            if (invokeReady)
            {
                if (!Task.Run((Func<Task<bool>>)IsInvokeQueueIdleAsync).GetAwaiter().GetResult())
                {
                    SetStatus("Queue Active", Color.FromArgb(255, 184, 77));
                    AppendLog("HiDream was not started: finish or cancel the active InvokeAI queue first.");
                    return;
                }

            }

            if (invokeReady || FindInvokeProcesses().Count > 0)
            {
                AppendLog("Stopping InvokeAI before loading HiDream.");
                StopInvoke();
                for (var attempt = 0; attempt < 20; attempt++)
                {
                    if (!Task.Run((Func<Task<bool>>)IsServerReadyAsync).GetAwaiter().GetResult())
                    {
                        break;
                    }
                    Thread.Sleep(250);
                }
                Thread.Sleep(800);
            }

            hiDreamBrowserOpened = false;
            var startInfo = new ProcessStartInfo();
            startInfo.FileName = HiDreamExe;
            startInfo.WorkingDirectory = HiDreamRoot;
            startInfo.Arguments = "\"" + HiDreamScript + "\" --model_path \"" + HiDreamModelPath
                + "\" --model_type dev --host 127.0.0.1 --port 7860";
            startInfo.UseShellExecute = false;
            startInfo.CreateNoWindow = true;
            startInfo.WindowStyle = ProcessWindowStyle.Hidden;
            startInfo.RedirectStandardOutput = true;
            startInfo.RedirectStandardError = true;
            startInfo.EnvironmentVariables["PYTHONUTF8"] = "1";
            startInfo.EnvironmentVariables["FA_VERSION"] = "0";
            startInfo.EnvironmentVariables["HIDREAM_USE_FLASH_ATTN"] = "0";

            try
            {
                hiDreamProcess = new Process();
                hiDreamProcess.StartInfo = startInfo;
                hiDreamProcess.EnableRaisingEvents = true;
                hiDreamProcess.OutputDataReceived += delegate(object sender, DataReceivedEventArgs args)
                {
                    if (!string.IsNullOrWhiteSpace(args.Data)) AppendLog(args.Data);
                };
                hiDreamProcess.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs args)
                {
                    if (!string.IsNullOrWhiteSpace(args.Data)) AppendLog(args.Data);
                };
                hiDreamProcess.Start();
                hiDreamProcess.BeginOutputReadLine();
                hiDreamProcess.BeginErrorReadLine();
                SetStatus("HiDream Starting", Color.FromArgb(255, 184, 77));
                AppendLog("Starting HiDream O1 Dev at " + hiDreamUrl);
            }
            catch (Exception ex)
            {
                SetStatus("HiDream Failed", Color.FromArgb(255, 93, 115));
                AppendLog(ex.Message);
            }
        }

        private void StopInvoke()
        {
            SetStatus("Stopping", Color.FromArgb(255, 184, 77));
            StopSimpleMode();

            if (serverProcess != null && !serverProcess.HasExited)
            {
                try
                {
                    KillProcessTree(serverProcess, 5000);
                }
                catch (Exception ex)
                {
                    AppendLog(ex.Message);
                }
            }

            foreach (var process in FindInvokeProcesses())
            {
                try
                {
                    KillProcessTree(process, 3000);
                }
                catch (Exception ex)
                {
                    AppendLog(ex.Message);
                }
                finally
                {
                    process.Dispose();
                }
            }

            serverProcess = null;
            browserOpened = false;
            SetStatus("Stopped", Color.FromArgb(150, 164, 178));
        }

        private void StopHiDream()
        {
            if (hiDreamProcess != null && !hiDreamProcess.HasExited)
            {
                try
                {
                    KillProcessTree(hiDreamProcess, 5000);
                }
                catch (Exception ex)
                {
                    AppendLog(ex.Message);
                }
            }

            foreach (var process in FindHiDreamProcesses())
            {
                try
                {
                    KillProcessTree(process, 3000);
                }
                catch (Exception ex)
                {
                    AppendLog(ex.Message);
                }
                finally
                {
                    process.Dispose();
                }
            }

            hiDreamProcess = null;
            hiDreamBrowserOpened = false;
        }

        private void StopAll()
        {
            SetStatus("Stopping", Color.FromArgb(255, 184, 77));
            StopHiDream();
            StopInvoke();
            SetStatus("Stopped", Color.FromArgb(150, 164, 178));
        }

        private void StartSimpleMode()
        {
            if (Task.Run((Func<Task<bool>>)IsSimpleModeReadyAsync).GetAwaiter().GetResult())
            {
                return;
            }

            if (!File.Exists(SimpleModeExe) || !File.Exists(SimpleModeScript))
            {
                AppendLog("Simple Mode files are missing.");
                return;
            }

            var startInfo = new ProcessStartInfo();
            startInfo.FileName = SimpleModeExe;
            startInfo.WorkingDirectory = Path.Combine(root, "simple-mode");
            startInfo.Arguments = "\"" + SimpleModeScript + "\"";
            startInfo.UseShellExecute = true;
            startInfo.WindowStyle = ProcessWindowStyle.Hidden;

            try
            {
                simpleModeProcess = new Process();
                simpleModeProcess.StartInfo = startInfo;
                simpleModeProcess.Start();
                AppendLog("Starting Simple Mode at " + simpleUrl);
            }
            catch (Exception ex)
            {
                AppendLog(ex.Message);
            }
        }

        private void StopSimpleMode()
        {
            if (simpleModeProcess != null && !simpleModeProcess.HasExited)
            {
                try
                {
                    KillProcessTree(simpleModeProcess, 3000);
                }
                catch (Exception ex)
                {
                    AppendLog(ex.Message);
                }
            }

            simpleModeProcess = null;
        }

        private void KillProcessTree(Process process, int waitMs)
        {
            if (process == null)
            {
                return;
            }

            try
            {
                if (process.HasExited)
                {
                    return;
                }

                using (var killer = new Process())
                {
                    killer.StartInfo = new ProcessStartInfo();
                    killer.StartInfo.FileName = "cmd.exe";
                    killer.StartInfo.Arguments = "/c taskkill /PID " + process.Id + " /T /F";
                    killer.StartInfo.CreateNoWindow = true;
                    killer.StartInfo.UseShellExecute = false;
                    killer.StartInfo.WindowStyle = ProcessWindowStyle.Hidden;
                    killer.Start();
                    killer.WaitForExit(waitMs);
                }
            }
            catch
            {
                try
                {
                    process.Kill();
                    process.WaitForExit(waitMs);
                }
                catch
                {
                }
            }
        }

        private void OpenSimpleMode()
        {
            StartSimpleMode();
            try
            {
                Process.Start(new ProcessStartInfo { FileName = simpleUrl, UseShellExecute = true });
            }
            catch (Exception ex)
            {
                AppendLog(ex.Message);
            }
        }

        private void OpenInvokeAI()
        {
            try
            {
                Process.Start(new ProcessStartInfo { FileName = url, UseShellExecute = true });
            }
            catch (Exception ex)
            {
                AppendLog(ex.Message);
            }
        }

        private void OpenHiDream()
        {
            try
            {
                Process.Start(new ProcessStartInfo { FileName = hiDreamUrl, UseShellExecute = true });
            }
            catch (Exception ex)
            {
                AppendLog(ex.Message);
            }
        }

        private void SetStatus(string text, Color color)
        {
            if (InvokeRequired)
            {
                BeginInvoke((Action)(() => SetStatus(text, color)));
                return;
            }

            statusLabel.Text = text;
            statusLabel.ForeColor = color;
            statusDot.DotColor = color;
            statusDot.Invalidate();
            statusPill.BorderColor = Color.FromArgb(
                Math.Min(255, color.R + 12),
                Math.Min(255, color.G + 12),
                Math.Min(255, color.B + 12));
            statusPill.Invalidate();
        }

        private void AppendLog(string text)
        {
            if (string.IsNullOrWhiteSpace(text))
            {
                return;
            }

            if (InvokeRequired)
            {
                BeginInvoke((Action)(() => AppendLog(text)));
                return;
            }

            logBox.AppendText(text + Environment.NewLine);
            logBox.SelectionStart = logBox.Text.Length;
            logBox.ScrollToCaret();
        }
    }

    internal sealed class DotControl : Control
    {
        public Color DotColor { get; set; }

        public DotControl()
        {
            DotColor = Color.FromArgb(150, 164, 178);
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint, true);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            base.OnPaint(e);
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            using (var brush = new SolidBrush(DotColor))
            {
                e.Graphics.FillEllipse(brush, 0, 0, Width - 1, Height - 1);
            }
        }
    }

    internal sealed class RoundedPanel : Panel
    {
        public int Radius { get; set; }
        public Color BorderColor { get; set; }

        public RoundedPanel()
        {
            Radius = 14;
            BorderColor = Color.FromArgb(30, 41, 53);
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw | ControlStyles.UserPaint, true);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            using (var path = RoundedRectangle(ClientRectangle, Radius))
            using (var brush = new SolidBrush(BackColor))
            using (var pen = new Pen(BorderColor, 1))
            {
                e.Graphics.FillPath(brush, path);
                var rect = ClientRectangle;
                rect.Width -= 1;
                rect.Height -= 1;
                using (var borderPath = RoundedRectangle(rect, Radius))
                {
                    e.Graphics.DrawPath(pen, borderPath);
                }
            }
        }

        public static GraphicsPath RoundedRectangle(Rectangle bounds, int radius)
        {
            var path = new GraphicsPath();
            var diameter = Math.Max(1, radius * 2);
            var arc = new Rectangle(bounds.Location, new Size(diameter, diameter));
            path.AddArc(arc, 180, 90);
            arc.X = bounds.Right - diameter;
            path.AddArc(arc, 270, 90);
            arc.Y = bounds.Bottom - diameter;
            path.AddArc(arc, 0, 90);
            arc.X = bounds.Left;
            path.AddArc(arc, 90, 90);
            path.CloseFigure();
            return path;
        }
    }

    internal sealed class ModernButton : Button
    {
        private bool hovering;
        public Color FillColor { get; set; }
        public Color HoverColor { get; set; }
        public Color BorderColor { get; set; }

        public ModernButton()
        {
            FillColor = Color.FromArgb(21, 29, 39);
            HoverColor = Color.FromArgb(30, 42, 55);
            BorderColor = Color.FromArgb(42, 55, 69);
            FlatStyle = FlatStyle.Flat;
            FlatAppearance.BorderSize = 0;
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.ResizeRedraw, true);
        }

        protected override void OnMouseEnter(EventArgs e)
        {
            hovering = true;
            Invalidate();
            base.OnMouseEnter(e);
        }

        protected override void OnMouseLeave(EventArgs e)
        {
            hovering = false;
            Invalidate();
            base.OnMouseLeave(e);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            var rect = ClientRectangle;
            rect.Width -= 1;
            rect.Height -= 1;
            using (var path = RoundedPanel.RoundedRectangle(rect, 10))
            using (var brush = new SolidBrush(hovering ? HoverColor : FillColor))
            using (var pen = new Pen(BorderColor, 1))
            {
                e.Graphics.FillPath(brush, path);
                e.Graphics.DrawPath(pen, path);
            }

            TextRenderer.DrawText(
                e.Graphics,
                Text,
                Font,
                ClientRectangle,
                ForeColor,
                TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.SingleLine);
        }
    }
}
