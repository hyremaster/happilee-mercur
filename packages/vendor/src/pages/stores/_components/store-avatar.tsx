type StoreAvatarProps = {
  initials: string;
};

export const StoreAvatar = ({ initials }: StoreAvatarProps) => {
  return (
    <span
      className="inline-flex size-[36px] shrink-0 select-none items-center justify-center rounded-full bg-bg-secondary text-sm font-semibold text-text-secondary"
      aria-hidden="true"
    >
      {initials}
    </span>
  );
};
