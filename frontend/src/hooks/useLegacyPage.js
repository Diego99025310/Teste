import { useEffect } from 'react';

export function useLegacyPage({ pageId, initializer, title }) {
  useEffect(() => {
    const previousPage = document.body.dataset.page;
    if (pageId) {
      document.body.dataset.page = pageId;
    } else {
      delete document.body.dataset.page;
    }

    const previousTitle = document.title;
    if (title) {
      document.title = title;
    }

    let cleanup;
    if (typeof initializer === 'function') {
      cleanup = initializer();
    }

    return () => {
      if (previousPage) {
        document.body.dataset.page = previousPage;
      } else {
        delete document.body.dataset.page;
      }

      if (title) {
        document.title = previousTitle;
      }

      if (typeof cleanup === 'function') {
        cleanup();
      }
    };
  }, [pageId, initializer, title]);
}

export default useLegacyPage;
