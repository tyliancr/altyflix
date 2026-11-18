package fr.altyflix.tv;

import android.app.Activity;
import android.app.UiModeManager;
import android.content.res.Configuration;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

/**
 * Full-screen ALTYFLIX on Android TV and phones.
 *
 * The app shows the live site, so every Netlify deploy reaches the TV without
 * reinstalling. Accounts, lists and history come from Firebase as on any other
 * device. The remote's arrows and OK are handled by the site itself; Back
 * returns to the previous page and leaves the app from the home page.
 *
 * On a TV the app hides the system bars and keeps the screen on; on a phone it
 * keeps the status bar and only keeps the screen on during full-screen video.
 */
public class MainActivity extends Activity {

    private static final String HOME_URL = "https://altyflix.netlify.app/";
    private static final String SITE_HOST = "altyflix.netlify.app";

    private WebView webView;
    private FrameLayout root;
    private View fullscreenView;
    private WebChromeClient.CustomViewCallback fullscreenCallback;
    private boolean isTv;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        UiModeManager uiMode = (UiModeManager) getSystemService(UI_MODE_SERVICE);
        isTv = uiMode != null && uiMode.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION;
        if (isTv) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#060608"));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#060608"));
        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // Firebase session, preferences
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        // Tell the site where it runs (kept alongside the normal user agent): the TV app
        // switches the site to remote-control mode and lighter rendering
        s.setUserAgentString(s.getUserAgentString() + (isTv ? " AltyflixTV/1.1" : " AltyflixApp/1.1"));

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);

        webView.setWebViewClient(new WebViewClient() {
            private boolean isTrustedHost(String host) {
                if (host == null) return false;
                String h = host.toLowerCase();
                return SITE_HOST.equals(h)
                        || h.endsWith(".firebaseapp.com")
                        || h.equals("accounts.google.com")
                        || h.endsWith(".googleapis.com");
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();
                String host = uri.getHost();
                // Site pages and Firebase sign-in stay inside the app
                if ("https".equalsIgnoreCase(scheme) && isTrustedHost(host)) return false;
                // External HTTPS links open in system browser only on explicit user gesture
                if ("https".equalsIgnoreCase(scheme) && request.isForMainFrame() && request.hasGesture()) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, uri));
                    } catch (Exception ignored) {
                        // No external browser available
                    }
                }
                return true;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            // Video full screen (HTML5 player, trailers)
            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (fullscreenView != null) { callback.onCustomViewHidden(); return; }
                fullscreenView = view;
                fullscreenCallback = callback;
                root.addView(view, new FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
                webView.setVisibility(View.GONE);
                getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                hideSystemUi();
            }

            @Override
            public void onHideCustomView() {
                exitFullscreen();
            }
        });

        root.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);
        applySystemUi();

        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            webView.loadUrl(HOME_URL);
        }
        webView.requestFocus();
    }

    private void exitFullscreen() {
        if (fullscreenView == null) return;
        root.removeView(fullscreenView);
        fullscreenView = null;
        if (fullscreenCallback != null) fullscreenCallback.onCustomViewHidden();
        fullscreenCallback = null;
        webView.setVisibility(View.VISIBLE);
        webView.requestFocus();
        if (!isTv) {
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            showSystemUi();
        }
    }

    private void showSystemUi() {
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
    }

    // TV: always full screen. Phone: full screen only while a video is.
    private void applySystemUi() {
        if (isTv || fullscreenView != null) hideSystemUi();
    }

    private void hideSystemUi() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }

    private boolean onHomePage() {
        String url = webView.getUrl();
        if (url == null) return true;
        Uri uri = Uri.parse(url);
        String path = uri.getPath();
        return SITE_HOST.equals(uri.getHost()) && (path == null || path.equals("/") || path.isEmpty());
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (fullscreenView != null) { exitFullscreen(); return true; }
            if (!onHomePage() && webView.canGoBack()) { webView.goBack(); return true; }
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) applySystemUi();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    protected void onPause() {
        super.onPause();
        webView.onPause();
        CookieManager.getInstance().flush();
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
        applySystemUi();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            if (root != null) root.removeView(webView);
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
