import { useLayoutEffect } from "react";
import { MESSAGE_TYPES } from "../../../plugin/types/messages";

function ComponentDocument({ extractJson }: { extractJson: string | null }) {
  useLayoutEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data.pluginMessage;
      if (msg.type === MESSAGE_TYPES.COMPONENT_SPEC_JSON) {
        console.log("msg.data", msg.data);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  console.log("extractJson", extractJson);
  return <div>Document</div>;
}

export default ComponentDocument;
