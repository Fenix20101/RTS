"""Стальной рубеж — запуск игры как отдельного приложения Windows (pywebview + WebView2)."""
import os
import sys

# В exe без консоли (--windowed) sys.stdout/sys.stderr равны None. Встроенный веб-сервер pywebview
# пишет в stderr журнал запросов, падает на этом и перестаёт отдавать файлы — игра виснет на загрузке.
if sys.stdout is None:
    sys.stdout = open(os.devnull, 'w')
if sys.stderr is None:
    sys.stderr = open(os.devnull, 'w')

import webview


def resource_dir():
    # PyInstaller распаковывает файлы во временную папку sys._MEIPASS
    if hasattr(sys, '_MEIPASS'):
        return os.path.join(sys._MEIPASS, 'game')
    return os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))


class Api:
    # Окно хранится в «закрытом» поле (с подчёркиванием): pywebview не пытается
    # выставить его в JavaScript. Публичное поле window заставляло pywebview обходить
    # весь объект окна в его же потоке, и окно переставало отвечать.
    def __init__(self):
        self._window = None

    def toggle_fullscreen(self):
        if self._window:
            self._window.toggle_fullscreen()

    def quit(self):
        if self._window:
            self._window.destroy()


def main():
    api = Api()
    index = os.path.join(resource_dir(), 'index.html')
    window = webview.create_window(
        'Стальной рубеж',
        url=index,
        js_api=api,
        width=1366,
        height=800,
        min_size=(1024, 640),
        background_color='#0b0e0b',
        maximized=True,
    )
    api._window = window
    # отладка: STEELFRONT_DEBUG_PORT=9335 — подключение DevTools к окну игры
    if os.environ.get('STEELFRONT_DEBUG_PORT'):
        webview.settings['REMOTE_DEBUGGING_PORT'] = int(os.environ['STEELFRONT_DEBUG_PORT'])
    # портативный режим: игра ничего не сохраняет, поэтому WebView2 работает без кэша на диске
    # и не оставляет следов на чужом компьютере. Сервер — встроенный, внутри exe.
    webview.start(gui='edgechromium', http_server=True, private_mode=True, debug=False)


if __name__ == '__main__':
    main()
