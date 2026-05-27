// components/LeftPanel.tsx
"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";

export default function LeftPanel() {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-3 h-full pr-4">
      {/* First Box */}
      <div className="flex flex-col items-center gap-7 bg-[#181818] rounded-xl py-6 px-7 size-fit cursor-pointer">
        <div>
          <Image
            src="/StreamifyLogo.svg"
            alt="Streamify Logo"
            width={30}
            height={30}
            onClick={() => router.push("/")}
            priority
          />
        </div>
        <div>
          <Image
            src="/Search.svg"
            alt="Search"
            width={30}
            height={30}
            onClick={() => router.push("/search")}
            className="cursor-pointer"
          />
        </div>
        <div>
          <Image src="/Library.svg" alt="Library" width={30} height={30} />
        </div>
      </div>

      {/* Second Box (identical layout, different sizing) */}
      <div className="flex flex-col items-center gap-7 bg-[#181818] rounded-xl py-6 px-7 flex-1 w-fit">
        <div>
          <Image
            src="/StreamifyLogo.svg"
            alt="Streamify Logo"
            width={30}
            height={30}
            priority
          />
        </div>
        <div>
          <Image
            src="/Search.svg"
            alt="Search"
            width={30}
            height={30}
            onClick={() => router.push("/search")}
            className="cursor-pointer"
          />
        </div>
        <div>
          <Image src="/Library.svg" alt="Library" width={30} height={30} />
        </div>
      </div>
    </div>
  );
}
