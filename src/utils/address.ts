export const formatAddress = (lead: {
  property_address?: string;
  address?: string;
  property_city?: string;
  city?: string;
  property_state?: string;
  state?: string;
  property_postal_code?: string;
  zip_code?: string;
}): string => {
  const parts = [
    lead.property_address || lead.address,
    [
      lead.property_city || lead.city,
      lead.property_state || lead.state,
      lead.property_postal_code || lead.zip_code
    ].filter(Boolean).join(' ')
  ].filter(Boolean);
  
  return parts.join(', ');
};
