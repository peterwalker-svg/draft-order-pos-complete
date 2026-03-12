import "@shopify/ui-extensions/preact";
import {render} from 'preact';

export default async () => {
  render(<Extension />, document.body);
}

function Extension() {
  const {i18n} = shopify;

  return (
    <s-tile
      heading={i18n.translate('tile_heading')}
      subheading={i18n.translate('tile_subheading')}
      onClick={() => shopify.action.presentModal()}
    />
  );
}
